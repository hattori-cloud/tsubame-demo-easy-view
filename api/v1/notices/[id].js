const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {parseIfMatchHeader,setVersionEtag}=require('../../_lib/concurrency');
const {saveNotice}=require('../../_lib/workflow-store');
module.exports=async function handler(req,res){
  if(req.method!=='PATCH'){res.setHeader('Allow','PATCH');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'PATCHのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity);
    if(user.role_level!=='full'||!identity.mfa){const e=new Error('お知らせ更新には全社管理者のMFA確認が必要です');e.status=403;e.code='FULL_ADMIN_MFA_REQUIRED';throw e}
    const rid=requestId(req),notice=await saveNotice({user,id:String(req.query.id||''),body:req.body||{},expectedVersion:parseIfMatchHeader(req.headers['if-match']),requestId:rid});
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);setVersionEtag(res,notice.version);return res.status(200).json({notice})
  }catch(err){return sendApiError(req,res,err)}
};