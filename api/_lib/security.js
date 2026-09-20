/**
 * Production API security foundation.
 * v107: fail closed until a real identity provider/session verifier is configured.
 * IMPORTANT: Never trust role/scope values sent by the browser.
 */
function applySecurityHeaders(res){
  res.setHeader('Cache-Control','no-store');
  res.setHeader('X-Content-Type-Options','nosniff');
  res.setHeader('Referrer-Policy','no-referrer');
  res.setHeader('X-Frame-Options','DENY');
}
function requestId(req){
  const incoming=req.headers['x-request-id'];
  if(typeof incoming==='string' && incoming.trim()) return incoming.trim().slice(0,120);
  return 'req_'+Date.now().toString(36)+'_'+Math.random().toString(36).slice(2,10);
}
function errorBody(code,message,id){
  return {error:{code,message,request_id:id}};
}
function productionAuthConfigured(){
  return Boolean(process.env.TSUBAME_AUTH_ISSUER && process.env.TSUBAME_AUTH_AUDIENCE);
}
function rejectUntilAuthConfigured(req,res){
  const id=requestId(req);
  applySecurityHeaders(res);
  res.setHeader('X-Request-Id',id);
  if(!productionAuthConfigured()){
    res.status(503).json(errorBody(
      'AUTH_NOT_CONFIGURED',
      '本番認証が未設定のため、業務データAPIは利用できません',
      id
    ));
    return true;
  }
  return false;
}
module.exports={applySecurityHeaders,requestId,errorBody,productionAuthConfigured,rejectUntilAuthConfigured};
