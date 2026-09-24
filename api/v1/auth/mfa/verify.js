const {applySecurityHeaders,requestId,errorBody,productionAuthConfigured}=require('../../../_lib/security');
const {tokenHash,newRawToken,secureCookie}=require('../../../_lib/auth');
const {withTransaction}=require('../../../_lib/db');
const {getMfaChallenge,findMfaMaterial,markMfaVerified,recordMfaFailure,createSession,writeAuthAudit,hashMetadata}=require('../../../_lib/auth-store');
const {decryptSecret,verifyTotp}=require('../../../_lib/mfa');

module.exports=async function handler(req,res){
  const id=requestId(req);applySecurityHeaders(res);res.setHeader('X-Request-Id',id);res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json(errorBody('METHOD_NOT_ALLOWED','POSTのみ利用できます',id))}
  if(!productionAuthConfigured())return res.status(503).json(errorBody('AUTH_NOT_CONFIGURED','本番認証が未設定です',id));
  const challengeToken=typeof req.body?.challenge_token==='string'?req.body.challenge_token.trim():'';
  const code=typeof req.body?.code==='string'?req.body.code.trim():'';
  if(!challengeToken||!/^\d{6}$/.test(code))return res.status(401).json(errorBody('MFA_FAILED','追加認証を確認できません',id));
  let challenge;
  try{challenge=await getMfaChallenge(tokenHash(challengeToken))}catch(_){return res.status(503).json(errorBody('MFA_STORE_UNAVAILABLE','追加認証保存先を利用できません',id))}
  if(!challenge||challenge.purpose!=='verify'||Number(challenge.failed_attempts)>=5)return res.status(401).json(errorBody('MFA_FAILED','追加認証を確認できません',id));
  let material,ok=false;
  try{material=await findMfaMaterial(challenge.user_id);ok=verifyTotp(decryptSecret(material),code)}catch(_){ok=false}
  if(!ok){
    try{await recordMfaFailure(challenge.id);await writeAuthAudit({action:'mfa_failed',userId:challenge.user_id,result:'denied',requestId:id,summary:'TOTP verification failed'})}catch(_){}
    return res.status(401).json(errorBody('MFA_FAILED','追加認証を確認できません',id))
  }
  const rawSession=newRawToken(),ua=hashMetadata(String(req.headers['user-agent']||'').slice(0,500)),ip=hashMetadata(String(req.headers['x-forwarded-for']||'').split(',')[0].trim());
  let session;
  try{session=await withTransaction(async client=>{
    await markMfaVerified(challenge.id,client);
    const created=await createSession({userId:challenge.user_id,mfaVerified:true,tokenHash:tokenHash(rawSession),ttlSeconds:28800,userAgentHash:ua,ipPrefixHash:ip},client);
    await writeAuthAudit({action:'mfa_success',userId:challenge.user_id,result:'success',requestId:id,summary:'MFA verified; session issued'},client);
    return created
  })}catch(_){return res.status(503).json(errorBody('SESSION_CREATE_FAILED','ログインセッションを開始できません',id))}
  res.setHeader('Set-Cookie',secureCookie(rawSession,28800));
  return res.status(200).json({authenticated:true,mfa_verified:true,session_expires_at:session.expires_at})
};
