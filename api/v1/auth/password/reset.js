const {authenticateRequest,sendApiError,newRawToken,tokenHash}=require('../../../_lib/auth');
const {resolveCurrentUser}=require('../../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../../_lib/security');
const {issuePasswordReset}=require('../../../_lib/user-store');

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),actor=resolveCurrentUser(identity);
    if(actor.role_level!=='full'||!identity.mfa){const e=new Error('パスワード再設定発行には全社管理者のMFA確認が必要です');e.status=403;e.code='FULL_ADMIN_MFA_REQUIRED';throw e}
    const raw=newRawToken(),rid=requestId(req);
    const token=await issuePasswordReset({actor,userId:String(req.body?.user_id||''),tokenHash:tokenHash(raw),requestId:rid});
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('Cache-Control','no-store');
    return res.status(201).json({reset_token:raw,expires_at:token.expires_at,expires_in:1200})
  }catch(err){return sendApiError(req,res,err)}
};
