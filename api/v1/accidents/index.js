const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {listAccidents,createAccident}=require('../../_lib/safety-store');

module.exports=async function handler(req,res){
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),id=requestId(req);
    if(req.method==='GET'){
      const result=await listAccidents(user,req.query||{});
      applySecurityHeaders(res);res.setHeader('X-Request-Id',id);
      return res.status(200).json(result)
    }
    if(req.method==='POST'){
      const accident=await createAccident({user,body:req.body||{},requestId:id});
      applySecurityHeaders(res);res.setHeader('X-Request-Id',id);res.setHeader('ETag','"'+accident.version+'"');
      return res.status(201).json({accident})
    }
    res.setHeader('Allow','GET, POST');
    return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETまたはPOSTのみ利用できます'})
  }catch(err){return sendApiError(req,res,err)}
};
