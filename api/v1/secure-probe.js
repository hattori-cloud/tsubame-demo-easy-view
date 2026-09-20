const {rejectUntilAuthConfigured,applySecurityHeaders,requestId,errorBody}=require('../_lib/security');

module.exports=function handler(req,res){
  if(rejectUntilAuthConfigured(req,res)) return;
  const id=requestId(req);
  applySecurityHeaders(res);
  res.setHeader('X-Request-Id',id);
  // v107 intentionally does not accept browser-supplied identity/role/scope.
  // A verified identity-provider token/session must be implemented before this route can return business data.
  return res.status(501).json(errorBody(
    'IDENTITY_VERIFIER_NOT_IMPLEMENTED',
    '認証基盤との署名検証が未実装です',
    id
  ));
};
