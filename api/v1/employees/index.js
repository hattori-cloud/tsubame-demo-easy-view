const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {stagingFixturesAllowed}=require('../../_lib/runtime-config');
const {resolveCurrentUser,listStagingEmployeesForUser}=require('../../_lib/authorization');
const {listEmployeesForUser}=require('../../_lib/employee-store');

module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity);
    const fixture=stagingFixturesAllowed();
    const result=fixture?listStagingEmployeesForUser(user,req.query||{}):await listEmployeesForUser(user,req.query||{});
    const id=requestId(req);applySecurityHeaders(res);res.setHeader('X-Request-Id',id);
    return res.status(200).json({...result,data_mode:fixture?'fictional-staging-fixtures':'postgres'})
  }catch(err){return sendApiError(req,res,err)}
};
