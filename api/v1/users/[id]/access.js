const {authenticateRequest,sendApiError}=require('../../../_lib/auth');
const {resolveCurrentUser}=require('../../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../../_lib/security');
const {parseIfMatchHeader,setVersionEtag}=require('../../../_lib/concurrency');
const {updateUserAccess}=require('../../../_lib/user-store');

module.exports=async function handler(req,res){
  if(req.method!=='PATCH'){res.setHeader('Allow','PATCH');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'PATCHのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),actor=resolveCurrentUser(identity);
    if(!identity.mfa){const e=new Error('権限変更にはMFA確認済みセッションが必要です');e.status=403;e.code='MFA_REQUIRED';throw e}
    const rid=requestId(req),user=await updateUserAccess({
      actor,userId:String(req.query.id||''),roleLevel:req.body?.role_level,safetyAuthority:Boolean(req.body?.safety_authority),scopes:req.body?.scopes||[],permissions:req.body?.permissions||[],
      expectedVersion:parseIfMatchHeader(req.headers['if-match']),requestId:rid
    });
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);setVersionEtag(res,user.version);return res.status(200).json({user,relogin_required:true})
  }catch(err){return sendApiError(req,res,err)}
};
