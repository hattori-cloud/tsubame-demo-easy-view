const crypto=require('crypto');
const {hash,Algorithm}=require('@node-rs/argon2');
const {authenticateRequest,sendApiError,newRawToken,tokenHash}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {listUsers,createUser}=require('../../_lib/user-store');

module.exports=async function handler(req,res){
  try{
    const identity=await authenticateRequest(req),actor=resolveCurrentUser(identity),rid=requestId(req);
    if(actor.role_level!=='full'||!identity.mfa){const e=new Error('利用者管理には全社管理者のMFA確認済みセッションが必要です');e.status=403;e.code='FULL_ADMIN_MFA_REQUIRED';throw e}
    if(req.method==='GET'){
      const result=await listUsers(actor,req.query||{});
      applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);
      return res.status(200).json(result)
    }
    if(req.method==='POST'){
      const setupToken=newRawToken(),unknownPassword=crypto.randomBytes(48).toString('base64url');
      const passwordHash=await hash(unknownPassword,{algorithm:Algorithm.Argon2id,memoryCost:19456,timeCost:2,parallelism:1,outputLen:32});
      const user=await createUser({
        actor,employeeId:String(req.body?.employee_id||''),loginId:String(req.body?.login_id||''),displayName:String(req.body?.display_name||''),
        roleLevel:String(req.body?.role_level||'scoped'),safetyAuthority:Boolean(req.body?.safety_authority),scopes:req.body?.scopes||[],permissions:req.body?.permissions||[],
        passwordHash,resetTokenHash:tokenHash(setupToken),requestId:rid
      });
      applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('Cache-Control','no-store');res.setHeader('ETag','"'+user.version+'"');
      return res.status(201).json({user,setup_token:setupToken,setup_expires_in:1800})
    }
    res.setHeader('Allow','GET, POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETまたはPOSTのみ利用できます'})
  }catch(err){return sendApiError(req,res,err)}
};
