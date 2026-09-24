const {applySecurityHeaders,requestId,errorBody,productionAuthConfigured}=require('../../_lib/security');

function genericAuthError(id){
  return errorBody('LOGIN_FAILED','ID・社員番号・パスワードを確認してください',id)
}
function cleanText(value,max){
  return typeof value==='string'?value.trim().slice(0,max):''
}

module.exports=async function handler(req,res){
  const id=requestId(req);
  applySecurityHeaders(res);
  res.setHeader('X-Request-Id',id);
  res.setHeader('Cache-Control','no-store');

  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return res.status(405).json(errorBody('METHOD_NOT_ALLOWED','POSTのみ利用できます',id))
  }

  const loginId=cleanText(req.body?.login_id,128);
  const employeeNo=cleanText(req.body?.employee_no,64);
  const password=typeof req.body?.password==='string'?req.body.password:'';

  if(!loginId||!employeeNo||!password){
    return res.status(401).json(genericAuthError(id))
  }
  if(!productionAuthConfigured()){
    return res.status(503).json(errorBody('AUTH_NOT_CONFIGURED','本番認証が未設定です',id))
  }

  // Shared demo intentionally stops here.
  // Production adapter: login_id lookup -> immutable employee_id -> current employee_no check
  // -> state/retirement/lock check -> Argon2id-equivalent verification
  // -> MFA challenge or auth_sessions creation -> audit.
  return res.status(503).json(errorBody(
    'CREDENTIAL_STORE_NOT_CONFIGURED',
    '本番の資格情報・セッション保存先が未接続です',
    id
  ))
};
