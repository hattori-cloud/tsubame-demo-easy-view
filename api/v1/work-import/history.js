const {authenticateRequest,sendApiError,AuthError}=require('../../_lib/auth');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {listWorkImports}=require('../../_lib/work-import-store');

module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req);const user=resolveCurrentUser(identity);
    if(user.role_level!=='full')throw new AuthError(403,'FULL_ADMIN_REQUIRED','勤務集計の取込履歴は全社管理者のみ利用できます');
    const result=await listWorkImports({user,filters:req.query||{}});
    const id=requestId(req);applySecurityHeaders(res);res.setHeader('X-Request-Id',id);return res.status(200).json(result)
  }catch(err){return sendApiError(req,res,err)}
};
