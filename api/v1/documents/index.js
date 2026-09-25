const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {createDocumentMetadata}=require('../../_lib/credential-store');

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    const document=await createDocumentMetadata({user,identity,body:req.body||{},requestId:rid});
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('ETag','"'+document.version+'"');
    return res.status(201).json({document})
  }catch(err){return sendApiError(req,res,err)}
};