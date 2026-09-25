const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {documentStorageAdapterReady}=require('../../_lib/runtime-config');
const {query}=require('../../_lib/db');
const {
  getDocumentStorageAdapter,encryptTicket,randomStorageKey,validateUploadRequest
}=require('../../_lib/document-storage');
const {prepareDocumentUpload}=require('../../_lib/document-original-store');

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    if(!['full','scoped'].includes(user.role_level)){const e=new Error('書類原本登録は管理者のみ利用できます');e.status=403;e.code='MANAGER_REQUIRED';throw e}
    if(!documentStorageAdapterReady()){const e=new Error('承認済みprivate原本ストレージアダプターが未接続です');e.status=503;e.code='DOCUMENT_STORAGE_ADAPTER_NOT_READY';throw e}

    const prepared=await prepareDocumentUpload({user,identity,body:req.body||{}});
    const file=validateUploadRequest({contentType:req.body?.content_type,sizeBytes:req.body?.size_bytes});
    const storageKey=randomStorageKey(),adapter=getDocumentStorageAdapter();
    const upload=await adapter.createUploadAuthorization({
      storageKey,contentType:file.contentType,sizeBytes:file.sizeBytes,expiresSeconds:60
    });
    const ticket=encryptTicket({
      type:'document_upload',user_id:user.id,...prepared,storage_key:storageKey,
      expected_content_type:file.contentType,expected_size_bytes:file.sizeBytes
    },60);

    await query(`
      insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary)
      values($1,'document_upload_ticket_issued','document_upload',$2,$3,'success',$4,$5)
    `,[user.id,storageKey.slice(-32),prepared.employee_id,rid,prepared.category+' / short-lived private upload authorization']);

    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);
    return res.status(200).json({
      upload_ticket:ticket,
      upload:{method:upload.method||'PUT',url:upload.upload_url,token:upload.upload_token||null,expires_at:upload.expires_at},
      expires_in:60
    })
  }catch(err){return sendApiError(req,res,err)}
};
