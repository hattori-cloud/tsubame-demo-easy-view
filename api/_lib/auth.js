const crypto=require('crypto');
const {applySecurityHeaders,requestId,errorBody,productionAuthConfigured}=require('./security');

class AuthError extends Error{
  constructor(status,code,message){super(message);this.status=status;this.code=code}
}

let jwksCache={url:'',expiresAt:0,keys:[]};

function base64urlJson(part){
  try{return JSON.parse(Buffer.from(part,'base64url').toString('utf8'))}
  catch(_){throw new AuthError(401,'INVALID_TOKEN','認証トークンの形式が正しくありません')}
}
function getBearer(req){
  const raw=req.headers.authorization||'';
  const m=/^Bearer\s+(.+)$/i.exec(raw);
  if(!m)throw new AuthError(401,'AUTH_REQUIRED','認証が必要です');
  return m[1].trim()
}
function audienceMatches(actual,expected){
  return Array.isArray(actual)?actual.includes(expected):actual===expected
}
async function loadJwks(){
  const url=process.env.TSUBAME_AUTH_JWKS_URL;
  if(!url)throw new AuthError(503,'AUTH_NOT_CONFIGURED','JWKS URLが未設定です');
  const now=Date.now();
  if(jwksCache.url===url&&jwksCache.expiresAt>now&&jwksCache.keys.length)return jwksCache.keys;
  const controller=new AbortController();
  const timer=setTimeout(()=>controller.abort(),5000);
  let response;
  try{response=await fetch(url,{headers:{accept:'application/json'},signal:controller.signal})}
  catch(_){throw new AuthError(503,'AUTH_PROVIDER_UNAVAILABLE','認証鍵を取得できません')}
  finally{clearTimeout(timer)}
  if(!response.ok)throw new AuthError(503,'AUTH_PROVIDER_UNAVAILABLE','認証鍵を取得できません');
  let body;
  try{body=await response.json()}catch(_){throw new AuthError(503,'AUTH_PROVIDER_INVALID_RESPONSE','認証鍵の応答が不正です')}
  if(!Array.isArray(body.keys)||!body.keys.length)throw new AuthError(503,'AUTH_PROVIDER_INVALID_RESPONSE','利用可能な認証鍵がありません');
  jwksCache={url,expiresAt:now+5*60*1000,keys:body.keys};
  return jwksCache.keys
}
async function verifyAccessToken(token){
  if(!productionAuthConfigured())throw new AuthError(503,'AUTH_NOT_CONFIGURED','本番認証が未設定です');
  const parts=token.split('.');
  if(parts.length!==3)throw new AuthError(401,'INVALID_TOKEN','認証トークンの形式が正しくありません');
  const header=base64urlJson(parts[0]),claims=base64urlJson(parts[1]);
  if(header.alg!=='RS256'||!header.kid)throw new AuthError(401,'UNSUPPORTED_TOKEN','RS256署名トークンのみ受け付けます');
  const keys=await loadJwks();
  let jwk=keys.find(k=>k.kid===header.kid&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'));
  if(!jwk){
    jwksCache.expiresAt=0;
    const refreshed=await loadJwks();
    jwk=refreshed.find(k=>k.kid===header.kid&&(!k.alg||k.alg==='RS256')&&(!k.use||k.use==='sig'))
  }
  if(!jwk)throw new AuthError(401,'UNKNOWN_SIGNING_KEY','認証トークンの署名鍵を確認できません');
  let key;
  try{key=crypto.createPublicKey({key:jwk,format:'jwk'})}
  catch(_){throw new AuthError(503,'AUTH_KEY_INVALID','認証鍵を利用できません')}
  const signed=Buffer.from(parts[0]+'.'+parts[1]);
  const signature=Buffer.from(parts[2],'base64url');
  const ok=crypto.verify('RSA-SHA256',signed,key,signature);
  if(!ok)throw new AuthError(401,'INVALID_SIGNATURE','認証トークンの署名を確認できません');

  const now=Math.floor(Date.now()/1000),skew=60;
  if(!claims.sub)throw new AuthError(401,'INVALID_TOKEN','認証主体がありません');
  if(typeof claims.exp!=='number'||claims.exp<now-skew)throw new AuthError(401,'TOKEN_EXPIRED','認証の有効期限が切れています');
  if(typeof claims.nbf==='number'&&claims.nbf>now+skew)throw new AuthError(401,'TOKEN_NOT_ACTIVE','認証トークンはまだ有効ではありません');
  if(claims.iss!==process.env.TSUBAME_AUTH_ISSUER)throw new AuthError(401,'INVALID_ISSUER','認証元が一致しません');
  if(!audienceMatches(claims.aud,process.env.TSUBAME_AUTH_AUDIENCE))throw new AuthError(401,'INVALID_AUDIENCE','認証対象が一致しません');

  const domain=(process.env.TSUBAME_AUTH_ALLOWED_DOMAIN||'').trim().toLowerCase();
  if(domain){
    const email=String(claims.email||claims.preferred_username||'').toLowerCase();
    if(!email.endsWith('@'+domain))throw new AuthError(403,'COMPANY_ACCOUNT_REQUIRED','会社で許可されたアカウントが必要です')
  }
  return {subject:String(claims.sub),email:claims.email||claims.preferred_username||'',claims}
}
async function authenticateRequest(req){
  return verifyAccessToken(getBearer(req))
}
function sendApiError(req,res,err){
  const id=requestId(req);
  applySecurityHeaders(res);res.setHeader('X-Request-Id',id);
  const status=err instanceof AuthError?err.status:500;
  const code=err instanceof AuthError?err.code:'INTERNAL_ERROR';
  const message=err instanceof AuthError?err.message:'サーバー処理に失敗しました';
  return res.status(status).json(errorBody(code,message,id))
}
module.exports={AuthError,authenticateRequest,verifyAccessToken,sendApiError};
