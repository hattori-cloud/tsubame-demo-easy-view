const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {parseIfMatchHeader,setVersionEtag}=require('../../_lib/concurrency');
const {updateComplaint}=require('../../_lib/safety-store');

module.exports=async function handler(req,res){
  if(req.method!=='PATCH'){res.setHeader('Allow','PATCH');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'PATCHのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    const complaint=await updateComplaint({user,id:String(req.query.id||''),body:req.body||{},expectedVersion:parseIfMatchHeader(req.headers['if-match']),requestId:rid});
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);setVersionEtag(res,complaint.version);
    return res.status(200).json({complaint})
  }catch(err){return sendApiError(req,res,err)}
};
