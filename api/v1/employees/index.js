const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {stagingFixturesAllowed}=require('../../_lib/runtime-config');
const {resolveCurrentUser,listStagingEmployeesForUser}=require('../../_lib/authorization');
const {listEmployeesForUser,createEmployee}=require('../../_lib/employee-store');

module.exports=async function handler(req,res){
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    if(req.method==='GET'){
      const fixture=stagingFixturesAllowed();
      const result=fixture?listStagingEmployeesForUser(user,req.query||{}):await listEmployeesForUser(user,req.query||{});
      applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);
      return res.status(200).json({...result,data_mode:fixture?'fictional-staging-fixtures':'postgres'})
    }
    if(req.method==='POST'){
      if(stagingFixturesAllowed()){const e=new Error('架空fixtureは読み取り専用です');e.status=409;e.code='FIXTURES_READ_ONLY';throw e}
      if(user.role_level!=='full'||!identity.mfa){const e=new Error('社員登録には全社管理者のMFA確認済みセッションが必要です');e.status=403;e.code='FULL_ADMIN_MFA_REQUIRED';throw e}
      const employee=await createEmployee({user,body:req.body||{},requestId:rid});
      applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('ETag','"'+employee.version+'"');
      return res.status(201).json({employee})
    }
    res.setHeader('Allow','GET, POST');
    return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETまたはPOSTのみ利用できます'})
  }catch(err){return sendApiError(req,res,err)}
};
