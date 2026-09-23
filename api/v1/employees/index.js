const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {resolveCurrentUser,listStagingEmployeesForUser}=require('../../_lib/authorization');

module.exports=async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETのみ利用できます'})
  }
  try{
    const identity=await authenticateRequest(req);
    const user=resolveCurrentUser(identity);
    const result=listStagingEmployeesForUser(user,req.query||{});
    const id=requestId(req);
    applySecurityHeaders(res);
    res.setHeader('X-Request-Id',id);
    return res.status(200).json({...result,data_mode:'fictional-staging-fixtures'})
  }catch(err){
    return sendApiError(req,res,err)
  }
};
