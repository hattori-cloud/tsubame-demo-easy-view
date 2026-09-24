const {hash,Algorithm}=require('@node-rs/argon2');
const {applySecurityHeaders,requestId,errorBody,productionAuthConfigured}=require('../../../../_lib/security');
const {tokenHash,clearSessionCookie}=require('../../../../_lib/auth');
const {completePasswordReset}=require('../../../../_lib/user-store');

module.exports=async function handler(req,res){
  const rid=requestId(req);applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json(errorBody('METHOD_NOT_ALLOWED','POSTのみ利用できます',rid))}
  if(!productionAuthConfigured())return res.status(503).json(errorBody('AUTH_NOT_CONFIGURED','本番認証が未設定です',rid));
  const raw=String(req.body?.reset_token||'').trim(),password=String(req.body?.new_password||'');
  if(!raw||password.length<12||password.length>128)return res.status(422).json(errorBody('INVALID_RESET_INPUT','再設定情報または新しいパスワードを確認してください',rid));
  try{
    const passwordHash=await hash(password,{algorithm:Algorithm.Argon2id,memoryCost:19456,timeCost:2,parallelism:1,outputLen:32});
    await completePasswordReset({tokenHash:tokenHash(raw),passwordHash,requestId:rid});
    res.setHeader('Set-Cookie',clearSessionCookie());
    return res.status(200).json({changed:true,relogin_required:true})
  }catch(err){
    const status=Number(err.status)||500,code=err.code||'RESET_FAILED',message=status>=500?'パスワード再設定に失敗しました':err.message;
    return res.status(status).json(errorBody(code,message,rid))
  }
};
