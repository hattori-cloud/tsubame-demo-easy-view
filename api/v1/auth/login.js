const {verify}=require('@node-rs/argon2');
const {applySecurityHeaders,requestId,errorBody,productionAuthConfigured}=require('../../_lib/security');
const {newRawToken,tokenHash,secureCookie}=require('../../_lib/auth');
const {withTransaction}=require('../../_lib/db');
const {findCredentialAccount,findCredentialAccountById,recordLoginFailure,clearLoginFailures,createSession,createMfaChallenge,writeAuthAudit,hashMetadata}=require('../../_lib/auth-store');
const {keysForLogin,assertLoginAllowed,recordLoginFailure:recordNetworkLoginFailure}=require('../../_lib/login-rate-limit');

function genericAuthError(id){return errorBody('LOGIN_FAILED','ID・社員番号・パスワードを確認してください',id)}
function cleanText(value,max){return typeof value==='string'?value.trim().slice(0,max):''}
function sleep(ms){return new Promise(resolve=>setTimeout(resolve,ms))}
async function delayedAuthFailure(res,id,startedAt){
  const remaining=180-(Date.now()-startedAt);
  if(remaining>0)await sleep(remaining);
  return res.status(401).json(genericAuthError(id))
}
function clientMeta(req){
  const ua=String(req.headers['user-agent']||'').slice(0,500);
  const forwarded=String(req.headers['x-forwarded-for']||'').split(',')[0].trim();
  return {userAgentHash:hashMetadata(ua),ipPrefixHash:hashMetadata(forwarded)}
}

module.exports=async function handler(req,res){
  const id=requestId(req);
  applySecurityHeaders(res);res.setHeader('X-Request-Id',id);res.setHeader('Cache-Control','no-store');
  if(req.method!=='POST'){res.setHeader('Allow','POST');return res.status(405).json(errorBody('METHOD_NOT_ALLOWED','POSTのみ利用できます',id))}

  const loginId=cleanText(req.body?.login_id,128),employeeNo=cleanText(req.body?.employee_no,64);
  const password=typeof req.body?.password==='string'?req.body.password:'';
  if(!loginId||!employeeNo||!password)return res.status(401).json(genericAuthError(id));
  if(password.length>256)return res.status(401).json(genericAuthError(id));
  if(!productionAuthConfigured())return res.status(503).json(errorBody('AUTH_NOT_CONFIGURED','本番認証が未設定です',id));

  const authStartedAt=Date.now();
  let rateKeys;
  try{
    rateKeys=keysForLogin(req,loginId);
    await assertLoginAllowed(rateKeys)
  }catch(err){
    if(err?.code==='LOGIN_RATE_LIMITED'){
      try{await writeAuthAudit({action:'login_rate_limited',result:'denied',requestId:id,summary:'distributed login rate limit active'})}catch(_){}
      const remaining=180-(Date.now()-authStartedAt);if(remaining>0)await sleep(remaining);
      return res.status(429).json(errorBody('LOGIN_RATE_LIMITED','ログイン試行が多すぎます。しばらくしてから再度お試しください',id))
    }
    return res.status(503).json(errorBody('RATE_LIMIT_UNAVAILABLE','ログイン保護機能を利用できません',id))
  }
  let account;
  try{account=await findCredentialAccount(loginId)}catch(_){return res.status(503).json(errorBody('AUTH_STORE_UNAVAILABLE','認証保存先を利用できません',id))}
  if(!account){
    try{
      const rate=await recordNetworkLoginFailure(rateKeys);
      if(rate.source?.blocked||rate.sourceLogin?.blocked)await writeAuthAudit({action:'login_rate_limit_reached',result:'denied',requestId:id,summary:'distributed login threshold reached'})
    }catch(_){return res.status(503).json(errorBody('RATE_LIMIT_UNAVAILABLE','ログイン保護機能を利用できません',id))}
    return delayedAuthFailure(res,id,authStartedAt)
  }

  const locked=account.locked_until&&new Date(account.locked_until).getTime()>Date.now();
  const allowed=account.state==='active'&&account.employee_lifecycle_status!=='retired'&&!locked&&String(account.employee_no)===employeeNo;
  let passwordOk=false;
  if(allowed){
    try{passwordOk=await verify(account.password_hash,password)}catch(_){passwordOk=false}
  }
  if(!allowed||!passwordOk){
    try{
      await recordLoginFailure(account.id);
      const rate=await recordNetworkLoginFailure(rateKeys);
      if(rate.source?.blocked||rate.sourceLogin?.blocked)await writeAuthAudit({action:'login_rate_limit_reached',userId:account.id,result:'denied',requestId:id,summary:'distributed login threshold reached'});
      await writeAuthAudit({action:'login_failed',userId:account.id,result:'denied',requestId:id,summary:'generic credential failure'})
    }catch(_){return res.status(503).json(errorBody('RATE_LIMIT_UNAVAILABLE','ログイン保護機能を利用できません',id))}
    return delayedAuthFailure(res,id,authStartedAt)
  }

  const meta=clientMeta(req);
  if(account.mfa_required){
    const rawChallenge=newRawToken();
    try{
      await withTransaction(async client=>{
        const current=await findCredentialAccountById(account.id,client,{forUpdate:true});
        const currentLocked=current?.locked_until&&new Date(current.locked_until).getTime()>Date.now();
        const credentialsStillCurrent=Boolean(
          current&&current.state==='active'&&current.employee_lifecycle_status!=='retired'&&!currentLocked&&
          String(current.employee_no)===employeeNo&&String(current.password_hash)===String(account.password_hash)
        );
        if(!credentialsStillCurrent){const e=new Error('credentials changed before MFA challenge issuance');e.code='CREDENTIALS_CHANGED';throw e}
        await createMfaChallenge({userId:account.id,challengeHash:tokenHash(rawChallenge),purpose:current.mfa_enrolled_at?'verify':'enroll',ttlSeconds:300},client);
        await writeAuthAudit({action:'mfa_challenge_created',userId:account.id,result:'success',requestId:id,summary:'primary credentials accepted'},client)
      })
    }catch(err){
      if(err?.code==='CREDENTIALS_CHANGED')return delayedAuthFailure(res,id,authStartedAt);
      return res.status(503).json(errorBody('MFA_CHALLENGE_FAILED','追加認証を開始できません',id))
    }
    return res.status(202).json({mfa_required:true,mfa_enrollment_required:!account.mfa_enrolled_at,challenge_token:rawChallenge,expires_in:300})
  }

  const rawSession=newRawToken();
  let session;
  try{
    session=await withTransaction(async client=>{
      const current=await findCredentialAccountById(account.id,client,{forUpdate:true});
      const currentLocked=current?.locked_until&&new Date(current.locked_until).getTime()>Date.now();
      const credentialsStillCurrent=Boolean(
        current&&current.state==='active'&&current.employee_lifecycle_status!=='retired'&&!currentLocked&&
        String(current.employee_no)===employeeNo&&String(current.password_hash)===String(account.password_hash)
      );
      if(!credentialsStillCurrent){const e=new Error('credentials changed before session issuance');e.code='CREDENTIALS_CHANGED';throw e}
      await clearLoginFailures(account.id,client);
      const created=await createSession({userId:account.id,mfaVerified:false,tokenHash:tokenHash(rawSession),ttlSeconds:28800,...meta},client);
      if(!created){const e=new Error('account is no longer eligible for a session');e.code='SESSION_NOT_ALLOWED';throw e}
      await writeAuthAudit({action:'login_success',userId:account.id,result:'success',requestId:id,summary:'session issued'},client);
      return created
    })
  }catch(err){
    if(err?.code==='SESSION_NOT_ALLOWED'||err?.code==='CREDENTIALS_CHANGED')return delayedAuthFailure(res,id,authStartedAt);
    return res.status(503).json(errorBody('SESSION_CREATE_FAILED','ログインセッションを開始できません',id))
  }
  res.setHeader('Set-Cookie',secureCookie(rawSession,28800));
  return res.status(200).json({authenticated:true,mfa_required:false,session_expires_at:session.expires_at,user:{id:account.id,display_name:account.display_name,role_level:account.role_level}})
};
