const {applySecurityHeaders,requestId,errorBody,productionAuthConfigured}=require('../../../../_lib/security');
const {tokenHash}=require('../../../../_lib/auth');
const {getMfaChallenge,setMfaPendingSecret,findCredentialAccountById}=require('../../../../_lib/auth-store');
const {generateTotpEnrollment,decryptSecret,totpEnrollmentUri}=require('../../../../_lib/mfa');

module.exports=async function handler(req,res){
  const id=requestId(req);applySecurityHeaders(res);res.setHeader('X-Request-Id',id);res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json(errorBody('METHOD_NOT_ALLOWED','POSTのみ利用できます',id))}
  if(!productionAuthConfigured())return res.status(503).json(errorBody('AUTH_NOT_CONFIGURED','本番認証が未設定です',id));
  const token=typeof req.body?.challenge_token==='string'?req.body.challenge_token.trim():'';
  if(!token)return res.status(401).json(errorBody('MFA_ENROLLMENT_FAILED','MFA登録を開始できません',id));
  let challenge;
  try{challenge=await getMfaChallenge(tokenHash(token))}catch(_){return res.status(503).json(errorBody('MFA_STORE_UNAVAILABLE','MFA保存先を利用できません',id))}
  if(!challenge||challenge.purpose!=='enroll'||Number(challenge.failed_attempts)>=5)return res.status(401).json(errorBody('MFA_ENROLLMENT_FAILED','MFA登録を開始できません',id));
  const account=await findCredentialAccountById(challenge.user_id);
  if(!account||!account.mfa_required)return res.status(401).json(errorBody('MFA_ENROLLMENT_FAILED','MFA登録を開始できません',id));
  let enrollment;
  if(challenge.pending_secret_ciphertext){
    const secret=decryptSecret({mfa_secret_ciphertext:challenge.pending_secret_ciphertext,mfa_secret_iv:challenge.pending_secret_iv,mfa_secret_tag:challenge.pending_secret_tag});
    enrollment={secret,uri:totpEnrollmentUri(account.login_id,secret)}
  }else{
    enrollment=generateTotpEnrollment(account.login_id);
    await setMfaPendingSecret(challenge.id,{ciphertext:enrollment.ciphertext,iv:enrollment.iv,tag:enrollment.tag})
  }
  return res.status(200).json({mfa_enrollment:true,secret:enrollment.secret,otpauth_uri:enrollment.uri,expires_at:challenge.expires_at})
};
