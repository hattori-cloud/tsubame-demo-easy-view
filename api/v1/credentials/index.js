const {authenticateRequest,sendApiError,AuthError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {listCredentials}=require('../../_lib/credential-store');

module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    const employeeId=String(req.query?.employee_id||'').trim();
    if(!employeeId)throw new AuthError(422,'EMPLOYEE_ID_REQUIRED','対象社員を指定してください');
    const result=await listCredentials(user,identity,employeeId);
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('Cache-Control','no-store');
    return res.status(200).json(result)
  }catch(err){return sendApiError(req,res,err)}
};
