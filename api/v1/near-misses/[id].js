const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {parseIfMatchHeader,setVersionEtag}=require('../../_lib/concurrency');
const {getNearMiss,updateNearMiss}=require('../../_lib/safety-store');

module.exports=async function handler(req,res){
  if(!['GET','PATCH'].includes(req.method)){res.setHeader('Allow','GET, PATCH');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GET/PATCHのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    if(req.method==='GET'){
      const near_miss=await getNearMiss(user,String(req.query.id||''));
      applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);setVersionEtag(res,near_miss.version);
      return res.status(200).json({near_miss})
    }
    const near_miss=await updateNearMiss({user,id:String(req.query.id||''),body:req.body||{},expectedVersion:parseIfMatchHeader(req.headers['if-match']),requestId:rid});
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);setVersionEtag(res,near_miss.version);
    return res.status(200).json({near_miss})
  }catch(err){return sendApiError(req,res,err)}
};
