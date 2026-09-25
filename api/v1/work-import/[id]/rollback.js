const {authenticateRequest,sendApiError,AuthError}=require('../../../_lib/auth');
const {applySecurityHeaders,requestId}=require('../../../_lib/security');
const {resolveCurrentUser}=require('../../../_lib/authorization');
const {rollbackWorkImport}=require('../../../_lib/work-import-store');

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req);const user=resolveCurrentUser(identity);
    if(user.role_level!=='full')throw new AuthError(403,'FULL_ADMIN_REQUIRED','勤務集計のロールバックは全社管理者のみ利用できます');
    const id=requestId(req);
    const batch=await rollbackWorkImport({user,batchId:String(req.query?.id||''),reason:req.body?.reason,requestId:id});
    applySecurityHeaders(res);res.setHeader('X-Request-Id',id);return res.status(200).json({batch})
  }catch(err){return sendApiError(req,res,err)}
};
