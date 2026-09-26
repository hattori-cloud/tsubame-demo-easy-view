const {authenticateRequest,sendApiError}=require('../../../_lib/auth');
const {applySecurityHeaders,requestId}=require('../../../_lib/security');
const {parseIfMatchHeader,setVersionEtag}=require('../../../_lib/concurrency');
const {resolveCurrentUser}=require('../../../_lib/authorization');
const {transitionEmployee}=require('../../../_lib/employee-store');

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity);
    if(user.role_level!=='full'){const e=new Error('所属・勤務・休職・退職変更は全社管理者のみ実行できます');e.status=403;e.code='FULL_ADMIN_REQUIRED';throw e}
    if(!identity.mfa){const e=new Error('重要な所属・勤務・在籍変更にはMFA確認済みセッションが必要です');e.status=403;e.code='MFA_REQUIRED';throw e}
    const expectedVersion=parseIfMatchHeader(req.headers['if-match']),target=req.body?.target||{},reason=String(req.body?.reason||req.body?.handoff_note||'').trim();
    if(!reason){const e=new Error('変更理由または引継ぎ内容を入力してください');e.status=422;e.code='REASON_REQUIRED';throw e}
    const id=requestId(req);
    const employee=await transitionEmployee({employeeId:String(req.query.id||''),target,reason,handoffNote:String(req.body?.handoff_note||''),actorUserId:user.id,expectedVersion,requestId:id});
    applySecurityHeaders(res);res.setHeader('X-Request-Id',id);setVersionEtag(res,employee.version);
    return res.status(200).json({employee,transitioned:true,retirement_login_revocation:employee.lifecycle_status==='retired'})
  }catch(err){return sendApiError(req,res,err)}
};
