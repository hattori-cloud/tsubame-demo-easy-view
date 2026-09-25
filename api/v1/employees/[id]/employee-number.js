const {authenticateRequest,sendApiError}=require('../../../_lib/auth');
const {applySecurityHeaders,requestId}=require('../../../_lib/security');
const {parseIfMatchHeader,setVersionEtag}=require('../../../_lib/concurrency');
const {resolveCurrentUser}=require('../../../_lib/authorization');
const {changeEmployeeNumber}=require('../../../_lib/employee-store');

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity);
    if(user.role_level!=='full'){const e=new Error('社員番号変更は全社管理者のみ実行できます');e.status=403;e.code='FULL_ADMIN_REQUIRED';throw e}
    if(!identity.mfa){const e=new Error('社員番号変更にはMFA確認済みセッションが必要です');e.status=403;e.code='MFA_REQUIRED';throw e}
    const expectedVersion=parseIfMatchHeader(req.headers['if-match']),reason=String(req.body?.reason||'').trim(),next=String(req.body?.new_employee_no||'').trim();
    if(!reason){const e=new Error('社員番号変更理由を入力してください');e.status=422;e.code='REASON_REQUIRED';throw e}
    const id=requestId(req);
    const employee=await changeEmployeeNumber({employeeId:String(req.query.id||''),newEmployeeNo:next,reason,actorUserId:user.id,expectedVersion,requestId:id});
    applySecurityHeaders(res);res.setHeader('X-Request-Id',id);setVersionEtag(res,employee.version);
    return res.status(200).json({employee,changed:true})
  }catch(err){return sendApiError(req,res,err)}
};
