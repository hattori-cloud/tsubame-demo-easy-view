const {authenticateRequest,sendApiError}=require('../../../_lib/auth');
const {resolveCurrentUser}=require('../../../_lib/authorization');
const {documentStorageEnvPresent}=require('../../../_lib/runtime-config');
const {getDocumentForAccess}=require('../../../_lib/credential-store');

module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity);
    const doc=await getDocumentForAccess(user,identity,String(req.query.id||''));
    if(doc.storage_state!=='active'||doc.malware_scan_status!=='clean'){const e=new Error('安全確認済み原本のみ閲覧できます');e.status=409;e.code='DOCUMENT_NOT_ACTIVE';throw e}
    if(!documentStorageEnvPresent()){const e=new Error('書類原本ストレージが未接続です');e.status=503;e.code='DOCUMENT_STORAGE_NOT_CONFIGURED';throw e}
    const e=new Error('短時間ダウンロード認可アダプターの実装・検証完了まで原本取得を停止しています');e.status=503;e.code='DOCUMENT_STORAGE_ADAPTER_NOT_READY';throw e
  }catch(err){return sendApiError(req,res,err)}
};
