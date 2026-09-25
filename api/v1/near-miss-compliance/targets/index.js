const {authenticateRequest,sendApiError}=require('../../../_lib/auth');
const {resolveCurrentUser}=require('../../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../../_lib/security');
const {addMonthlyTarget}=require('../../../_lib/near-miss-compliance-store');

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity);
    if(user.role_level!=='full'||!identity.mfa){const e=new Error('月次対象追加には全社管理者のMFA確認が必要です');e.status=403;e.code='FULL_ADMIN_MFA_REQUIRED';throw e}
    const rid=requestId(req),target=await addMonthlyTarget({user,body:req.body||{},requestId:rid});
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('ETag','"'+target.version+'"');return res.status(201).json({target})
  }catch(err){return sendApiError(req,res,err)}
};