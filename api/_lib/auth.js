const crypto=require('crypto');
const {applySecurityHeaders,requestId,errorBody,productionAuthConfigured}=require('./security');
const {stagingFixturesAllowed}=require('./runtime-config');

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
function tokenHash(token){
  return crypto.createHash('sha256').update(String(token)).digest('hex')
}
async function loadSessionByHash(_hash){
  throw new AuthError(503,'SESSION_STORE_NOT_CONFIGURED','本番セッション保存先が未接続です')
}
async function authenticateRequest(req){
  if(!productionAuthConfigured())throw new AuthError(503,'AUTH_NOT_CONFIGURED','本番認証が未設定です');
  const token=rawSessionToken(req);
  const session=await loadSessionByHash(tokenHash(token));
  if(!session)throw new AuthError(401,'INVALID_SESSION','認証セッションを確認できません');
  if(session.revoked_at)throw new AuthError(401,'SESSION_REVOKED','認証セッションは失効しています');
  if(new Date(session.expires_at).getTime()<=Date.now())throw new AuthError(401,'SESSION_EXPIRED','認証セッションの有効期限が切れています');
  return {subject:String(session.user_id),user_id:String(session.user_id),mfa:Boolean(session.mfa_verified),session_id:String(session.id)}
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
module.exports={AuthError,authenticateRequest,sendApiError,parseCookies,rawSessionToken,tokenHash};
