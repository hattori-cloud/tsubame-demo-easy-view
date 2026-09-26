const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {parseIfMatchHeader,setVersionEtag}=require('../../_lib/concurrency');
const {getComplaint,updateComplaint}=require('../../_lib/safety-store');

module.exports=async function handler(req,res){
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req),id=String(req.query.id||'');
    if(req.method==='GET'){
      const complaint=await getComplaint(user,id);
      applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);setVersionEtag(res,complaint.version);
      return res.status(200).json({complaint})
    }
    if(req.method==='PATCH'){
      const complaint=await updateComplaint({user,id,body:req.body||{},expectedVersion:parseIfMatchHeader(req.headers['if-match']),requestId:rid});
      applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);setVersionEtag(res,complaint.version);
      return res.status(200).json({complaint})
    }
    res.setHeader('Allow','GET, PATCH');
    return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETまたはPATCHのみ利用できます'})
  }catch(err){return sendApiError(req,res,err)}
};
