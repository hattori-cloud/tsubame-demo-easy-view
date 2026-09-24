const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {listSupport,createSupport}=require('../../_lib/support-store');

module.exports=async function handler(req,res){
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    if(req.method==='GET'){const result=await listSupport(user,'training',req.query||{});applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);return res.status(200).json(result)}
    if(req.method==='POST'){const record=await createSupport({user,kind:'training',body:req.body||{},requestId:rid});applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('ETag','"'+record.version+'"');return res.status(201).json({record})}
    res.setHeader('Allow','GET, POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETまたはPOSTのみ利用できます'})
  }catch(err){return sendApiError(req,res,err)}
};