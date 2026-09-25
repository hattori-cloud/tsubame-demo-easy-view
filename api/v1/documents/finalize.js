const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {documentStorageEnvPresent}=require('../../_lib/runtime-config');

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity);
    if(!['full','scoped'].includes(user.role_level)){const e=new Error('書類原本確定は管理者のみ利用できます');e.status=403;e.code='MANAGER_REQUIRED';throw e}
    if(!documentStorageEnvPresent()){const e=new Error('書類原本ストレージが未接続です');e.status=503;e.code='DOCUMENT_STORAGE_NOT_CONFIGURED';throw e}
    const e=new Error('隔離検査・SHA-256・malware clean確認の実装完了まで原本確定を停止しています');e.status=503;e.code='DOCUMENT_FINALIZE_ADAPTER_NOT_READY';throw e
  }catch(err){return sendApiError(req,res,err)}
};
