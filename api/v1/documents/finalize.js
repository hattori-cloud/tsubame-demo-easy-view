const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {documentStorageAdapterReady,documentMalwareScannerReady}=require('../../_lib/runtime-config');
const {query,withTransaction}=require('../../_lib/db');
const {employeeForUser,policyForCategory,requireDocumentPrivilege}=require('../../_lib/credential-store');
const {headPrivate,issuePrivateScanDownload}=require('../../_lib/document-storage');
const {scanOriginal}=require('../../_lib/document-malware');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function samePolicy(ticket,policy){
  return String(ticket.security_class)===String(policy.security_class)&&
    String(ticket.access_level)===String(policy.access_level)&&
    String(ticket.original_handling)===String(policy.original_handling)&&
    Boolean(ticket.verification_required)===Boolean(policy.verification_required)
}

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    if(!['full','scoped'].includes(user.role_level))throw problem(403,'MANAGER_REQUIRED','書類原本確定は管理者のみ利用できます');
    if(!documentStorageAdapterReady())throw problem(503,'DOCUMENT_STORAGE_ADAPTER_NOT_READY','private原本ストレージが未接続です');
    if(!documentMalwareScannerReady())throw problem(503,'DOCUMENT_MALWARE_SCANNER_NOT_READY','malware検査アダプターが未接続または未承認です');

    const ticketId=String(req.body?.ticket_id||'');
    const ticket=(await query('select * from document_upload_tickets where id=$1 limit 1',[ticketId])).rows[0];
    if(!ticket)throw problem(404,'UPLOAD_TICKET_NOT_FOUND','原本アップロード認可が見つかりません');
    await employeeForUser(user,ticket.employee_id);
    const policy=await policyForCategory(ticket.category);requireDocumentPrivilege(user,identity,policy);
    if(!samePolicy(ticket,policy))throw problem(409,'DOCUMENT_POLICY_CHANGED','原本アップロード認可以降に書類ルールが変更されています。新しい認可を取得してください');
    if(ticket.state!=='issued'||new Date(ticket.expires_at).getTime()<=Date.now())throw problem(409,'UPLOAD_TICKET_EXPIRED','原本アップロード認可が期限切れまたは利用済みです');

    const blob=await headPrivate(ticket.storage_key);
    if(Number(blob.size)!==Number(ticket.expected_size_bytes))throw problem(422,'DOCUMENT_SIZE_MISMATCH','アップロード済み原本のサイズが認可条件と一致しません');
    if(String(blob.contentType||'').toLowerCase()!==String(ticket.expected_content_type).toLowerCase())throw problem(422,'DOCUMENT_CONTENT_TYPE_MISMATCH','アップロード済み原本のMIMEが認可条件と一致しません');

    const scanUrl=await issuePrivateScanDownload(ticket.storage_key);
    const scan=await scanOriginal({
      downloadUrl:scanUrl.url,
      expectedContentType:ticket.expected_content_type,
      expectedSizeBytes:ticket.expected_size_bytes,
      expectedSha256:ticket.client_sha256
    });

    if(scan.verdict==='blocked'){
      await withTransaction(async client=>{
        const locked=(await query('select * from document_upload_tickets where id=$1 for update',[ticketId],client)).rows[0];
        if(locked?.state==='issued')await query("update document_upload_tickets set state='cancelled',updated_at=now() where id=$1",[ticketId],client);
        await query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'原本malware検査','document_upload_ticket',$2,$3,'denied',$4,$5)",[user.id,ticketId,ticket.employee_id,rid,'blocked / '+scan.engine+' / '+scan.signature],client)
      });
      throw problem(422,'DOCUMENT_MALWARE_BLOCKED','危険なファイルとして検出されたため原本登録を拒否しました')
    }

    const document=await withTransaction(async client=>{
      const locked=(await query('select * from document_upload_tickets where id=$1 for update',[ticketId],client)).rows[0];
      if(!locked||locked.state!=='issued'||new Date(locked.expires_at).getTime()<=Date.now())throw problem(409,'UPLOAD_TICKET_CONSUMED','原本アップロード認可は既に利用済みまたは期限切れです');
      await employeeForUser(user,locked.employee_id,client);
      const currentPolicy=await policyForCategory(locked.category,client);requireDocumentPrivilege(user,identity,currentPolicy);
      if(!samePolicy(locked,currentPolicy))throw problem(409,'DOCUMENT_POLICY_CHANGED','原本アップロード認可以降に書類ルールが変更されています。新しい認可を取得してください');

      const row=(await query(`
        insert into documents(
          employee_id,qualification_id,category,name,kind,registered_on,expiry,status,
          security_class,access_level,original_handling,verification_required,paper_location,retention_until,
          original_filename,content_type,size_bytes,storage_key,storage_state,uploaded_at,uploaded_by_user_id,
          activated_at,content_sha256,malware_scan_status,malware_scanned_at
        ) values(
          $1,$2,$3,$4,$5,$6,$7,'pending',
          $8,$9,$10,$11,$12,$13,
          $14,$15,$16,$17,'active',now(),$18,
          now(),$19,'clean',now()
        ) returning *
      `,[
        locked.employee_id,locked.qualification_id,locked.category,locked.name,locked.kind,locked.registered_on,locked.expiry,
        locked.security_class,locked.access_level,locked.original_handling,locked.verification_required,locked.paper_location,locked.retention_until,
        locked.original_file_name,scan.content_type,scan.size_bytes,locked.storage_key,user.id,scan.sha256
      ],client)).rows[0];

      await query("update document_upload_tickets set state='finalized',finalized_document_id=$2,updated_at=now() where id=$1",[ticketId,row.id],client);
      await query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'原本確定','document',$2,$3,'success',$4,$5)",[user.id,row.id,row.employee_id,rid,'clean / sha256 '+scan.sha256.slice(0,12)+'... / '+scan.engine],client);
      return row
    });

    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('Cache-Control','no-store');
    return res.status(201).json({document})
  }catch(err){return sendApiError(req,res,err)}
};
