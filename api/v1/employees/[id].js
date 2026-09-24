const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {setVersionEtag}=require('../../_lib/concurrency');
const {stagingFixturesAllowed}=require('../../_lib/runtime-config');
const {resolveCurrentUser,getStagingEmployeeForUser}=require('../../_lib/authorization');
const {getEmployeeForUser}=require('../../_lib/employee-store');

module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),targetId=String(req.query.id||'');
    const fixture=stagingFixturesAllowed();
    const employee=fixture?getStagingEmployeeForUser(user,targetId):await getEmployeeForUser(user,targetId);
    const id=requestId(req);applySecurityHeaders(res);res.setHeader('X-Request-Id',id);setVersionEtag(res,employee.version);
    return res.status(200).json({employee,data_mode:fixture?'fictional-staging-fixtures':'postgres'})
  }catch(err){return sendApiError(req,res,err)}
};
