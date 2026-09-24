const {verify,hash,Algorithm}=require('@node-rs/argon2');
const {authenticateRequest,sendApiError,clearSessionCookie}=require('../../../_lib/auth');
const {withTransaction,query}=require('../../../_lib/db');
const {findCredentialAccountById,revokeAllUserSessions,writeAuthAudit}=require('../../../_lib/auth-store');
const {applySecurityHeaders,requestId}=require('../../../_lib/security');

function validNewPassword(value){
  const s=String(value||'');
  return s.length>=12&&s.length<=128
}
module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),current=String(req.body?.current_password||''),next=String(req.body?.new_password||'');
    if(!current||!validNewPassword(next)){const e=new Error('新しいパスワードは12〜128文字で入力してください');e.status=422;e.code='INVALID_NEW_PASSWORD';throw e}
    if(current===next){const e=new Error('現在と異なるパスワードを設定してください');e.status=422;e.code='PASSWORD_UNCHANGED';throw e}
    const account=await findCredentialAccountById(identity.user_id);
    if(!account||!(await verify(account.password_hash,current))){const e=new Error('現在のパスワードを確認できません');e.status=401;e.code='CURRENT_PASSWORD_INVALID';throw e}
    const nextHash=await hash(next,{algorithm:Algorithm.Argon2id,memoryCost:19456,timeCost:2,parallelism:1,outputLen:32});
    const id=requestId(req);
    await withTransaction(async client=>{
      await query(`update users set password_hash=$2,password_changed_at=now(),failed_login_count=0,locked_until=null,updated_at=now(),version=version+1 where id=$1`,[identity.user_id,nextHash],client);
      await revokeAllUserSessions(identity.user_id,'password_changed',client);
      await writeAuthAudit({actorUserId:identity.user_id,action:'password_changed',userId:identity.user_id,result:'success',requestId:id,summary:'password hash replaced; sessions revoked'},client)
    });
    applySecurityHeaders(res);res.setHeader('X-Request-Id',id);res.setHeader('Set-Cookie',clearSessionCookie());
    return res.status(200).json({changed:true,relogin_required:true})
  }catch(err){return sendApiError(req,res,err)}
};
