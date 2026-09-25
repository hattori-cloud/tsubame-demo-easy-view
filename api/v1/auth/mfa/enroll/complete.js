const {applySecurityHeaders,requestId,errorBody,productionAuthConfigured}=require('../../../../_lib/security');
const {tokenHash,newRawToken,secureCookie}=require('../../../../_lib/auth');
const {withTransaction}=require('../../../../_lib/db');
const {getMfaChallenge,findCredentialAccountById,enrollUserMfa,markMfaVerified,recordMfaFailure,recordLoginFailure,clearLoginFailures,createSession,writeAuthAudit,hashMetadata}=require('../../../../_lib/auth-store');
const {decryptSecret,verifyTotp}=require('../../../../_lib/mfa');

module.exports=async function handler(req,res){
  const id=requestId(req);applySecurityHeaders(res);res.setHeader('X-Request-Id',id);res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json(errorBody('METHOD_NOT_ALLOWED','POSTのみ利用できます',id))}
  if(!productionAuthConfigured())return res.status(503).json(errorBody('AUTH_NOT_CONFIGURED','本番認証が未設定です',id));
  const token=typeof req.body?.challenge_token==='string'?req.body.challenge_token.trim():'';
  const code=typeof req.body?.code==='string'?req.body.code.trim():'';
  if(!token||!/^\d{6}$/.test(code))return res.status(401).json(errorBody('MFA_ENROLLMENT_FAILED','MFA登録を確認できません',id));
  let challenge;
  try{challenge=await getMfaChallenge(tokenHash(token))}catch(_){return res.status(503).json(errorBody('MFA_STORE_UNAVAILABLE','MFA保存先を利用できません',id))}
  if(!challenge||challenge.purpose!=='enroll'||!challenge.pending_secret_ciphertext||Number(challenge.failed_attempts)>=5)return res.status(401).json(errorBody('MFA_ENROLLMENT_FAILED','MFA登録を確認できません',id));
  let account;
  try{account=await findCredentialAccountById(challenge.user_id)}catch(_){return res.status(503).json(errorBody('MFA_STORE_UNAVAILABLE','MFA保存先を利用できません',id))}
  const locked=account?.locked_until&&new Date(account.locked_until).getTime()>Date.now();
  if(!account||account.state!=='active'||account.employee_lifecycle_status==='retired'||locked)return res.status(401).json(errorBody('MFA_ENROLLMENT_FAILED','MFA登録を確認できません',id));
  const material={mfa_secret_ciphertext:challenge.pending_secret_ciphertext,mfa_secret_iv:challenge.pending_secret_iv,mfa_secret_tag:challenge.pending_secret_tag};
  let secret,ok=false;try{secret=decryptSecret(material);ok=verifyTotp(secret,code)}catch(_){ok=false}
  if(!ok){
    try{
      await withTransaction(async client=>{
        await recordMfaFailure(challenge.id,client);
        await recordLoginFailure(challenge.user_id,client);
        await writeAuthAudit({action:'mfa_enrollment_failed',userId:challenge.user_id,result:'denied',requestId:id,summary:'TOTP enrollment verification failed'},client)
      })
    }catch(_){}
    return res.status(401).json(errorBody('MFA_ENROLLMENT_FAILED','MFA登録を確認できません',id))
  }
  const rawSession=newRawToken(),ua=hashMetadata(String(req.headers['user-agent']||'').slice(0,500)),ip=hashMetadata(String(req.headers['x-forwarded-for']||'').split(',')[0].trim());
  let session;
  try{session=await withTransaction(async client=>{
    const consumed=await markMfaVerified(challenge.id,client);
    if(!consumed.rows[0]){const e=new Error('MFA enrollment challenge already consumed, expired or locked');e.code='MFA_CHALLENGE_CONSUMED';throw e}
    const created=await createSession({userId:challenge.user_id,mfaVerified:true,tokenHash:tokenHash(rawSession),ttlSeconds:28800,userAgentHash:ua,ipPrefixHash:ip},client);
    if(!created){const e=new Error('account is no longer eligible for a session');e.code='SESSION_NOT_ALLOWED';throw e}
    await enrollUserMfa(challenge.user_id,{ciphertext:challenge.pending_secret_ciphertext,iv:challenge.pending_secret_iv,tag:challenge.pending_secret_tag},client);
    await clearLoginFailures(challenge.user_id,client);
    await writeAuthAudit({action:'mfa_enrolled',userId:challenge.user_id,result:'success',requestId:id,summary:'MFA enrolled and verified'},client);
    return created
  })}catch(err){
    if(err?.code==='SESSION_NOT_ALLOWED'||err?.code==='MFA_CHALLENGE_CONSUMED')return res.status(401).json(errorBody('MFA_ENROLLMENT_FAILED','MFA登録を確認できません',id));
    return res.status(503).json(errorBody('MFA_ENROLLMENT_COMMIT_FAILED','MFA登録を保存できません',id))
  }
  res.setHeader('Set-Cookie',secureCookie(rawSession,28800));
  return res.status(200).json({authenticated:true,mfa_enrolled:true,mfa_verified:true,session_expires_at:session.expires_at})
};
