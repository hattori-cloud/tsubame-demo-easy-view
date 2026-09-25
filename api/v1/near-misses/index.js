const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {listNearMisses,createNearMiss}=require('../../_lib/safety-store');

module.exports=async function handler(req,res){
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    if(req.method==='GET'){
      const result=await listNearMisses(user,req.query||{});applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);return res.status(200).json(result)
    }
    if(req.method==='POST'){
      const near_miss=await createNearMiss({user,body:req.body||{},requestId:rid});applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('ETag','"'+near_miss.version+'"');return res.status(201).json({near_miss})
    }
    res.setHeader('Allow','GET, POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETまたはPOSTのみ利用できます'})
  }catch(err){return sendApiError(req,res,err)}
};
