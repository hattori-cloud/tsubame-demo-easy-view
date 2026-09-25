const {query,withTransaction}=require('./db');
const {employeeForUser,policyForCategory,requireDocumentPrivilege}=require('./credential-store');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function samePolicy(ticket,policy){
  return String(ticket.security_class)===String(policy.security_class)&&
    String(ticket.access_level)===String(policy.access_level)&&
    String(ticket.original_handling)===String(policy.original_handling)&&
    Boolean(ticket.verification_required)===Boolean(policy.verification_required)
}

async function loadIssuedTicket({user,identity,ticketId},client=null,{forUpdate=false}={}){
  const lock=forUpdate?' for update':'';
  const ticket=(await query('select * from document_upload_tickets where id=$1'+lock,[ticketId],client)).rows[0];
  if(!ticket)throw problem(404,'UPLOAD_TICKET_NOT_FOUND','原本アップロード認可が見つかりません');
  await employeeForUser(user,ticket.employee_id,client);
  const policy=await policyForCategory(ticket.category,client);requireDocumentPrivilege(user,identity,policy);
  if(!samePolicy(ticket,policy))throw problem(409,'DOCUMENT_POLICY_CHANGED','原本アップロード認可以降に書類ルールが変更されています。新しい認可を取得してください');
  if(ticket.state!=='issued'||new Date(ticket.expires_at).getTime()<=Date.now())throw problem(409,'UPLOAD_TICKET_CONSUMED','原本アップロード認可は既に利用済みまたは期限切れです');
  return ticket
}

async function blockUploadTicket({user,ticketId,employeeId,requestId,scan}){
  return withTransaction(async client=>{
    const locked=(await query('select * from document_upload_tickets where id=$1 for update',[ticketId],client)).rows[0];
    if(locked?.state==='issued')await query("update document_upload_tickets set state='cancelled',updated_at=now() where id=$1",[ticketId],client);
    await query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'原本malware検査','document_upload_ticket',$2,$3,'denied',$4,$5)",[user.id,ticketId,employeeId,requestId,'blocked / '+scan.engine+' / '+scan.signature],client);
    return {cancelled:Boolean(locked?.state==='issued')}
  })
}

async function finalizeCleanOriginal({user,identity,ticketId,scan,requestId}){
  if(scan?.verdict!=='clean')throw problem(422,'DOCUMENT_SCAN_NOT_CLEAN','clean判定以外の原本は確定できません');
  return withTransaction(async client=>{
    const locked=await loadIssuedTicket({user,identity,ticketId},client,{forUpdate:true});
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
    await query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'原本確定','document',$2,$3,'success',$4,$5)",[user.id,row.id,row.employee_id,requestId,'clean / sha256 '+scan.sha256.slice(0,12)+'... / '+scan.engine],client);
    return row
  })
}

module.exports={samePolicy,loadIssuedTicket,blockUploadTicket,finalizeCleanOriginal};
