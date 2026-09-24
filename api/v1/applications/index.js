const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {listApplications,createApplication}=require('../../_lib/workflow-store');
module.exports=async function handler(req,res){
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    if(req.method==='GET'){const result=await listApplications(user,req.query||{});applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);return res.status(200).json(result)}
    if(req.method==='POST'){const application=await createApplication({user,body:req.body||{},requestId:rid});applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('ETag','"'+application.version+'"');return res.status(201).json({application})}
    res.setHeader('Allow','GET, POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETまたはPOSTのみ利用できます'})
  }catch(err){return sendApiError(req,res,err)}
};