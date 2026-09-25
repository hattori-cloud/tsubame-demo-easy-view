const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {requestId}=require('../../_lib/security');
const {documentStorageAdapterReady,documentMalwareScannerReady}=require('../../_lib/runtime-config');
const {query}=require('../../_lib/db');
const {employeeForUser,requireDocumentPrivilege}=require('../../_lib/credential-store');
const {headPrivate}=require('../../_lib/document-storage');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    if(!['full','scoped'].includes(user.role_level))throw problem(403,'MANAGER_REQUIRED','書類原本確定は管理者のみ利用できます');
    if(!documentStorageAdapterReady())throw problem(503,'DOCUMENT_STORAGE_ADAPTER_NOT_READY','private原本ストレージが未接続です');
    const ticketId=String(req.body?.ticket_id||'');
    const ticket=(await query(`select * from document_upload_tickets where id=$1 limit 1`,[ticketId])).rows[0];
    if(!ticket)throw problem(404,'UPLOAD_TICKET_NOT_FOUND','原本アップロード認可が見つかりません');
    await employeeForUser(user,ticket.employee_id);
    requireDocumentPrivilege(user,identity,ticket);
    if(ticket.state!=='issued'||new Date(ticket.expires_at).getTime()<=Date.now())throw problem(409,'UPLOAD_TICKET_EXPIRED','原本アップロード認可が期限切れまたは利用済みです');
    if(!documentMalwareScannerReady())throw problem(503,'DOCUMENT_MALWARE_SCANNER_NOT_READY','malware検査アダプター接続まで原本確定を停止しています');
    const blob=await headPrivate(ticket.storage_key);
    if(Number(blob.size)!==Number(ticket.expected_size_bytes))throw problem(422,'DOCUMENT_SIZE_MISMATCH','アップロード済み原本のサイズが認可条件と一致しません');
    if(String(blob.contentType||'').toLowerCase()!==String(ticket.expected_content_type).toLowerCase())throw problem(422,'DOCUMENT_CONTENT_TYPE_MISMATCH','アップロード済み原本のMIMEが認可条件と一致しません');
    throw problem(503,'DOCUMENT_SCAN_PIPELINE_NOT_READY','SHA-256・malware scan・clean確定処理の接続完了まで原本確定を停止しています')
  }catch(err){return sendApiError(req,res,err)}
};
