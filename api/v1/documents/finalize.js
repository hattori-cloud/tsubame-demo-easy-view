const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {originalDocumentPipelineReady}=require('../../_lib/runtime-config');
const {getDocumentStorageAdapter,decryptTicket}=require('../../_lib/document-storage');
const {reserveDocumentOriginal,activateDocumentOriginal}=require('../../_lib/document-original-store');

function publicDocument(d){
  return {
    id:d.id,employee_id:d.employee_id,qualification_id:d.qualification_id,category:d.category,name:d.name,
    kind:d.kind,registered_on:d.registered_on,expiry:d.expiry,status:d.status,security_class:d.security_class,
    access_level:d.access_level,original_handling:d.original_handling,storage_state:d.storage_state,
    malware_scan_status:d.malware_scan_status,content_type:d.content_type,size_bytes:d.size_bytes,
    activated_at:d.activated_at,version:d.version
  }
}

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    if(!['full','scoped'].includes(user.role_level)){const e=new Error('書類原本確定は管理者のみ利用できます');e.status=403;e.code='MANAGER_REQUIRED';throw e}
    if(!originalDocumentPipelineReady()){
      const e=new Error('private原本ストレージとマルウェアスキャンの安全確認パイプラインが未接続です');
      e.status=503;e.code='DOCUMENT_ORIGINAL_PIPELINE_NOT_READY';throw e
    }

    const claims=decryptTicket(req.body?.upload_ticket);
    if(claims.type!=='document_upload'||String(claims.user_id)!==String(user.id)){
      const e=new Error('原本アップロードticketを確認できません');e.status=401;e.code='DOCUMENT_UPLOAD_TICKET_INVALID';throw e
    }
    const adapter=getDocumentStorageAdapter(),inspection=await adapter.inspectQuarantine(claims.storage_key);
    if(String(inspection.content_type)!==String(claims.expected_content_type)||Number(inspection.size_bytes)!==Number(claims.expected_size_bytes)){
      const e=new Error('アップロード内容がticket条件と一致しません');e.status=409;e.code='DOCUMENT_UPLOAD_MISMATCH';throw e
    }
    if(!/^[0-9a-f]{64}$/.test(String(inspection.sha256||''))){
      const e=new Error('原本SHA-256を確認できません');e.status=409;e.code='DOCUMENT_HASH_INVALID';throw e
    }
    if(inspection.malware_status!=='clean'){
      const e=new Error('安全確認済み原本だけを確定できます');e.status=409;e.code='DOCUMENT_MALWARE_NOT_CLEAN';throw e
    }

    const reserved=await reserveDocumentOriginal({user,identity,claims,inspection,requestId:rid});
    const activated=await adapter.activate(claims.storage_key);
    const document=await activateDocumentOriginal({
      user,identity,id:reserved.id,storageVersionId:activated.version_id,requestId:rid
    });
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);
    return res.status(201).json({document:publicDocument(document)})
  }catch(err){return sendApiError(req,res,err)}
};
