const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {documentStorageEnvPresent}=require('../../_lib/runtime-config');
const {employeeForUser,policyForCategory,requireDocumentPrivilege}=require('../../_lib/credential-store');

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    if(!['full','scoped'].includes(user.role_level)){const e=new Error('書類原本登録は管理者のみ利用できます');e.status=403;e.code='MANAGER_REQUIRED';throw e}
    await employeeForUser(user,String(req.body?.employee_id||''));
    const policy=await policyForCategory(String(req.body?.category||'').trim());
    requireDocumentPrivilege(user,identity,policy);
    if(!documentStorageEnvPresent()){const e=new Error('書類原本ストレージが未接続です');e.status=503;e.code='DOCUMENT_STORAGE_NOT_CONFIGURED';throw e}
    const e=new Error('private quarantine storage adapterの実装・検証完了まで原本アップロードを停止しています');e.status=503;e.code='DOCUMENT_STORAGE_ADAPTER_NOT_READY';throw e
  }catch(err){return sendApiError(req,res,err)}
};
