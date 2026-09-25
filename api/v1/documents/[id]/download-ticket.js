const {authenticateRequest,sendApiError}=require('../../../_lib/auth');
const {resolveCurrentUser}=require('../../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../../_lib/security');
const {documentStorageAdapterReady}=require('../../../_lib/runtime-config');
const {query}=require('../../../_lib/db');
const {getDocumentForAccess}=require('../../../_lib/credential-store');
const {issuePrivateDownload}=require('../../../_lib/document-storage');

module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    const doc=await getDocumentForAccess(user,identity,String(req.query.id||''));
    if(doc.storage_state!=='active'||doc.malware_scan_status!=='clean'||!doc.storage_key){const e=new Error('安全確認済み原本のみ閲覧できます');e.status=409;e.code='DOCUMENT_NOT_ACTIVE';throw e}
    if(!documentStorageAdapterReady()){const e=new Error('private原本ストレージが未接続です');e.status=503;e.code='DOCUMENT_STORAGE_ADAPTER_NOT_READY';throw e}
    const signed=await issuePrivateDownload(doc.storage_key);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'原本閲覧認可','document',$2,$3,'success',$4,'60秒private GET認可')`,[user.id,doc.id,doc.employee_id,rid]);
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('Cache-Control','no-store');
    return res.status(200).json({document_id:doc.id,download:{url:signed.url,expires_at:signed.expires_at}})
  }catch(err){return sendApiError(req,res,err)}
};
