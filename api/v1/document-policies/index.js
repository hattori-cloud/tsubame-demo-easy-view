const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {listDocumentPolicies}=require('../../_lib/credential-store');

module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    const policies=await listDocumentPolicies(user);
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('Cache-Control','no-store');
    return res.status(200).json({policies})
  }catch(err){return sendApiError(req,res,err)}
};
