const {authenticateRequest,sendApiError}=require('../../../_lib/auth');
const {resolveCurrentUser}=require('../../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../../_lib/security');
const {documentStorageAdapterReady}=require('../../../_lib/runtime-config');
const {getDocumentStorageAdapter}=require('../../../_lib/document-storage');
const {getDocumentForAccess}=require('../../../_lib/credential-store');
const {auditDocumentDownload}=require('../../../_lib/document-original-store');

module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    const doc=await getDocumentForAccess(user,identity,String(req.query.id||''));
    if(doc.storage_state!=='active'||doc.malware_scan_status!=='clean'){const e=new Error('安全確認済み原本のみ閲覧できます');e.status=409;e.code='DOCUMENT_NOT_ACTIVE';throw e}
    if(!documentStorageAdapterReady()){const e=new Error('承認済みprivate原本ストレージアダプターが未接続です');e.status=503;e.code='DOCUMENT_STORAGE_ADAPTER_NOT_READY';throw e}

    const access=await getDocumentStorageAdapter().createDownloadAuthorization({storageKey:doc.storage_key,expiresSeconds:60});
    await auditDocumentDownload({user,documentId:doc.id,employeeId:doc.employee_id,requestId:rid,result:'success'});
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('Cache-Control','no-store');
    return res.status(200).json({download_url:access.download_url,expires_at:access.expires_at,expires_in:60})
  }catch(err){return sendApiError(req,res,err)}
};
