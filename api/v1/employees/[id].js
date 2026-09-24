const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {setVersionEtag,parseIfMatchHeader}=require('../../_lib/concurrency');
const {stagingFixturesAllowed}=require('../../_lib/runtime-config');
const {resolveCurrentUser,getStagingEmployeeForUser}=require('../../_lib/authorization');
const {getEmployeeForUser,updateEmployee}=require('../../_lib/employee-store');

module.exports=async function handler(req,res){
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),targetId=String(req.query.id||''),rid=requestId(req);
    if(req.method==='GET'){
      const fixture=stagingFixturesAllowed();
      const employee=fixture?getStagingEmployeeForUser(user,targetId):await getEmployeeForUser(user,targetId);
      applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);setVersionEtag(res,employee.version);
      return res.status(200).json({employee,data_mode:fixture?'fictional-staging-fixtures':'postgres'})
    }
    if(req.method==='PATCH'){
      if(stagingFixturesAllowed()){const e=new Error('架空fixtureは読み取り専用です');e.status=409;e.code='FIXTURES_READ_ONLY';throw e}
      const employee=await updateEmployee({user,employeeId:targetId,body:req.body||{},expectedVersion:parseIfMatchHeader(req.headers['if-match']),requestId:rid});
      applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);setVersionEtag(res,employee.version);
      return res.status(200).json({employee})
    }
    res.setHeader('Allow','GET, PATCH');
    return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETまたはPATCHのみ利用できます'})
  }catch(err){return sendApiError(req,res,err)}
};
