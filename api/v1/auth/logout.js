const {authenticateRequest,sendApiError,clearSessionCookie}=require('../../_lib/auth');
const {revokeSession,writeAuthAudit}=require('../../_lib/auth-store');
const {applySecurityHeaders,requestId}=require('../../_lib/security');

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),id=requestId(req);
    await revokeSession(identity.session_id,'logout');
    await writeAuthAudit({actorUserId:identity.user_id,action:'logout',userId:identity.user_id,result:'success',requestId:id,summary:'session revoked'});
    applySecurityHeaders(res);res.setHeader('X-Request-Id',id);res.setHeader('Set-Cookie',clearSessionCookie());
    return res.status(200).json({logged_out:true})
  }catch(err){return sendApiError(req,res,err)}
};
