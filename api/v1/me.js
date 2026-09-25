const {authenticateRequest,sendApiError}=require('../_lib/auth');
const {applySecurityHeaders,requestId}=require('../_lib/security');
const {resolveCurrentUser}=require('../_lib/authorization');
const {stagingFixturesAllowed}=require('../_lib/runtime-config');

module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req);
    const user=resolveCurrentUser(identity);
    const id=requestId(req);applySecurityHeaders(res);res.setHeader('X-Request-Id',id);
    return res.status(200).json({
      user:{id:user.id,display_name:user.display_name,role_level:user.role_level,safety_authority:user.safety_authority,scopes:user.scopes||[]},
      identity:{subject:identity.subject,email:identity.email||''},
      data_mode:stagingFixturesAllowed()?'fictional-staging-fixtures':'postgres'
    })
  }catch(err){return sendApiError(req,res,err)}
};
