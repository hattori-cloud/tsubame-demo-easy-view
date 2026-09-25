const {authenticateRequest,sendApiError}=require('../../../_lib/auth');
const {resolveCurrentUser}=require('../../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../../_lib/security');
const {parseIfMatchHeader,setVersionEtag}=require('../../../_lib/concurrency');
const {setUserState}=require('../../../_lib/user-store');

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),actor=resolveCurrentUser(identity);
    if(!identity.mfa){const e=new Error('利用者再開にはMFA確認済みセッションが必要です');e.status=403;e.code='MFA_REQUIRED';throw e}
    const rid=requestId(req),user=await setUserState({actor,userId:String(req.query.id||''),state:'active',expectedVersion:parseIfMatchHeader(req.headers['if-match']),reason:String(req.body?.reason||''),requestId:rid});
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);setVersionEtag(res,user.version);
    return res.status(200).json({user,sessions_revoked:true})
  }catch(err){return sendApiError(req,res,err)}
};
