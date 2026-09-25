const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {listHandoffs,createHandoff}=require('../../_lib/workflow-store');

module.exports=async function handler(req,res){
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    if(req.method==='GET'){
      const handoffs=await listHandoffs(user);applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);return res.status(200).json({handoffs})
    }
    if(req.method==='POST'){
      const handoff=await createHandoff({user,body:req.body||{},requestId:rid});applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);return res.status(201).json({handoff})
    }
    res.setHeader('Allow','GET, POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETまたはPOSTのみ利用できます'})
  }catch(err){return sendApiError(req,res,err)}
};
