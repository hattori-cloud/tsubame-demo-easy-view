const crypto=require('crypto');
const {applySecurityHeaders,requestId,errorBody,productionAuthConfigured}=require('./security');
const {stagingFixturesAllowed}=require('./runtime-config');
const {loadSessionByTokenHash}=require('./auth-store');
const {findUserBySubject}=require('../_fixtures/staging-registry');

class AuthError extends Error{
  constructor(status,code,message){super(message);this.status=status;this.code=code}
}

function parseCookies(req){
  const raw=String(req.headers.cookie||'');
  const out={};
  raw.split(';').forEach(part=>{
    const i=part.indexOf('=');
    if(i<0)return;
    const key=part.slice(0,i).trim(),value=part.slice(i+1).trim();
    if(key)out[key]=decodeURIComponent(value)
  });
  return out
}
function rawSessionToken(req){
  const cookie=parseCookies(req).tsubame_session;
  if(cookie)return cookie;
  if(stagingFixturesAllowed()){
    const raw=String(req.headers.authorization||'');
    const m=/^Bearer\s+(.+)$/i.exec(raw);
    if(m)return m[1].trim()
  }
  throw new AuthError(401,'AUTH_REQUIRED','認証が必要です')
}
function sessionSecret(){
  const secret=String(process.env.TSUBAME_SESSION_SECRET||'');
  if(secret.length<32)throw new AuthError(503,'AUTH_NOT_CONFIGURED','セッション秘密鍵が未設定または短すぎます');
  return secret
}
function tokenHash(token){
  return crypto.createHmac('sha256',sessionSecret()).update(String(token)).digest('hex')
}
function newRawToken(){return crypto.randomBytes(32).toString('base64url')}
function secureCookie(token,maxAge=28800){
  return `tsubame_session=${encodeURIComponent(token)}; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=${maxAge}`
}
function clearSessionCookie(){
  return 'tsubame_session=; Path=/; HttpOnly; Secure; SameSite=Strict; Max-Age=0'
}
function stagingFixtureIdentity(req){
  if(!stagingFixturesAllowed())return null;
  const raw=String(req.headers.authorization||'');
  const m=/^Bearer\s+fixture:([^:]+)(?::(mfa))?$/i.exec(raw);
  if(!m)return null;
  const user=findUserBySubject(m[1]);
  if(!user)throw new AuthError(401,'INVALID_SESSION','認証セッションを確認できません');
  return {subject:user.external_subject,user_id:user.id,mfa:m[2]==='mfa',session_id:'fixture-session',user:{...user,employee_lifecycle_status:null},fixture:true}
}
async function authenticateRequest(req){
  if(req&&req._tsubameIdentity)return req._tsubameIdentity;
  const fixture=stagingFixtureIdentity(req);if(fixture){if(req)req._tsubameIdentity=fixture;return fixture}
  if(!productionAuthConfigured())throw new AuthError(503,'AUTH_NOT_CONFIGURED','本番認証が未設定です');
  const token=rawSessionToken(req);
  const session=await loadSessionByTokenHash(tokenHash(token));
  if(!session)throw new AuthError(401,'INVALID_SESSION','認証セッションを確認できません');
  if(session.revoked_at)throw new AuthError(401,'SESSION_REVOKED','認証セッションは失効しています');
  if(new Date(session.expires_at).getTime()<=Date.now())throw new AuthError(401,'SESSION_EXPIRED','認証セッションの有効期限が切れています');
  const user={
    id:String(session.user_id),employee_id:session.employee_id||null,display_name:session.display_name,
    role_level:session.role_level,safety_authority:Boolean(session.safety_authority),state:session.state,
    mfa_required:Boolean(session.mfa_required),scopes:session.scopes||[],permissions:session.permissions||[],
    employee_lifecycle_status:session.employee_lifecycle_status||null,employee_no:session.employee_no||null
  };
  const identity={subject:String(session.user_id),user_id:String(session.user_id),mfa:Boolean(session.mfa_verified),session_id:String(session.id),user};
  if(req)req._tsubameIdentity=identity;
  return identity
}
function sendApiError(req,res,err){
  const id=requestId(req);
  applySecurityHeaders(res);res.setHeader('X-Request-Id',id);
  const structured=err&&typeof err.status==='number'&&err.code&&err.message;
  const status=err instanceof AuthError?err.status:structured?err.status:500;
  const code=err instanceof AuthError?err.code:structured?err.code:'INTERNAL_ERROR';
  const message=err instanceof AuthError?err.message:structured?err.message:'サーバー処理に失敗しました';
  return res.status(status).json(errorBody(code,message,id))
}
module.exports={AuthError,authenticateRequest,sendApiError,parseCookies,rawSessionToken,tokenHash,newRawToken,secureCookie,clearSessionCookie,stagingFixtureIdentity};
