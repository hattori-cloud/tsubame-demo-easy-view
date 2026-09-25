const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {listNotices,saveNotice}=require('../../_lib/workflow-store');
module.exports=async function handler(req,res){
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    if(req.method==='GET'){const notices=await listNotices(user,req.query||{});applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);return res.status(200).json({notices})}
    if(req.method==='POST'){
      if(user.role_level!=='full'||!identity.mfa){const e=new Error('お知らせ作成には全社管理者のMFA確認が必要です');e.status=403;e.code='FULL_ADMIN_MFA_REQUIRED';throw e}
      const notice=await saveNotice({user,body:req.body||{},requestId:rid});applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('ETag','"'+notice.version+'"');return res.status(201).json({notice})
    }
    res.setHeader('Allow','GET, POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETまたはPOSTのみ利用できます'})
  }catch(err){return sendApiError(req,res,err)}
};