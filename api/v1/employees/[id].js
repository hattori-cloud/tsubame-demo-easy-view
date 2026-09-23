const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {setVersionEtag}=require('../../_lib/concurrency');
const {resolveCurrentUser,getStagingEmployeeForUser}=require('../../_lib/authorization');

module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req);
    const user=resolveCurrentUser(identity);
    const employee=getStagingEmployeeForUser(user,String(req.query.id||''));
    const id=requestId(req);applySecurityHeaders(res);res.setHeader('X-Request-Id',id);setVersionEtag(res,employee.version);
    return res.status(200).json({employee,data_mode:'fictional-staging-fixtures'})
  }catch(err){return sendApiError(req,res,err)}
};
