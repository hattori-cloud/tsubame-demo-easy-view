const {authenticateRequest,sendApiError}=require('../../../_lib/auth');
const {resolveCurrentUser}=require('../../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../../_lib/security');
const {respondConfirmation}=require('../../../_lib/workflow-store');
module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);const response=await respondConfirmation({user,confirmationId:String(req.query.id||''),response:req.body?.response,requestId:rid});applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);return res.status(200).json({response})}
  catch(err){return sendApiError(req,res,err)}
};