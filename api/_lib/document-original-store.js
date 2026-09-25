const {query,withTransaction}=require('./db');
const {
  employeeForUser,policyForCategory,requireDocumentPrivilege,documentVisibilitySql
}=require('./credential-store');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function cleanText(v,max=255){return String(v??'').trim().replace(/[\u0000-\u001f\u007f]/g,'').slice(0,max)}
function cleanFilename(v){
  const base=cleanText(v,255).replace(/[\\/]+/g,'_');
  return base||'document'
}
async function validateQualification(employeeId,qualificationId,client=null){
  if(!qualificationId)return null;
  const r=await query('select id from qualifications where id=$1 and employee_id=$2 and archived_at is null limit 1',[qualificationId,employeeId],client);
  if(!r.rows[0])throw problem(422,'QUALIFICATION_EMPLOYEE_MISMATCH','選択した資格は対象社員の有効な資格ではありません');
  return String(qualificationId)
}
async function prepareDocumentUpload({user,identity,body}){
  const employee=await employeeForUser(user,String(body?.employee_id||''));
  const category=cleanText(body?.category,120),name=cleanText(body?.name,255);
  if(!category||!name)throw problem(422,'REQUIRED_FIELDS','書類区分・書類名を入力してください');
  const policy=await policyForCategory(category);requireDocumentPrivilege(user,identity,policy);
  if(!['electronic_original','paper_and_electronic'].includes(policy.original_handling)){
    throw problem(409,'ELECTRONIC_ORIGINAL_NOT_ALLOWED','この書類区分は電子原本アップロード対象ではありません')
  }
  const qualificationId=await validateQualification(employee.id,body?.qualification_id||null);
  if(policy.original_handling==='paper_and_electronic'&&!cleanText(body?.paper_location,255)){
    throw problem(422,'PAPER_LOCATION_REQUIRED','紙原本の保管場所を入力してください')
  }
  return {
    employee_id:employee.id,
    qualification_id:qualificationId,
    category,
    name,
    kind:cleanText(body?.kind,120)||null,
    registered_on:cleanText(body?.registered_on,10)||new Date().toISOString().slice(0,10),
    expiry:cleanText(body?.expiry,10)||null,
    status:cleanText(body?.status,40)||'pending',
    paper_location:cleanText(body?.paper_location,255)||null,
    retention_until:cleanText(body?.retention_until,10)||null,
    original_filename:cleanFilename(body?.original_filename||body?.file_name||'document')
  }
}
async function reserveDocumentOriginal({user,identity,claims,inspection,requestId}){
  return withTransaction(async client=>{
    const employee=await employeeForUser(user,String(claims.employee_id||''),client);
    const policy=await policyForCategory(String(claims.category||''),client);requireDocumentPrivilege(user,identity,policy);
    if(!['electronic_original','paper_and_electronic'].includes(policy.original_handling)){
      throw problem(409,'ELECTRONIC_ORIGINAL_NOT_ALLOWED','この書類区分は電子原本アップロード対象ではありません')
    }
    const qualificationId=await validateQualification(employee.id,claims.qualification_id||null,client);
    try{
      const row=(await query(`
        insert into documents(
          employee_id,qualification_id,category,name,kind,registered_on,expiry,status,
          security_class,access_level,original_handling,verification_required,paper_location,retention_until,
          original_filename,content_type,size_bytes,storage_key,storage_state,uploaded_at,uploaded_by_user_id,
          content_sha256,malware_scan_status,malware_scanned_at
        ) values(
          $1,$2,$3,$4,$5,$6,$7,$8,
          $9,$10,$11,$12,$13,$14,
          $15,$16,$17,$18,'quarantine',now(),$19,
          $20,'clean',$21
        ) returning *
      `,[
        employee.id,qualificationId,claims.category,claims.name,claims.kind||null,claims.registered_on,
        claims.expiry||null,claims.status||'pending',policy.security_class,policy.access_level,policy.original_handling,
        policy.verification_required,claims.paper_location||null,claims.retention_until||null,
        claims.original_filename,inspection.content_type,inspection.size_bytes,claims.storage_key,user.id,
        inspection.sha256,inspection.malware_scanned_at
      ],client)).rows[0];
      await query(`
        insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary)
        values($1,'document_upload_received','document',$2,$3,'success',$4,$5)
      `,[user.id,row.id,employee.id,requestId,claims.category+' / quarantine'],client);
      return row
    }catch(err){
      if(String(err.code)==='23505')throw problem(409,'DOCUMENT_ALREADY_FINALIZED','この原本アップロードは既に確定処理されています');
      throw err
    }
  })
}
async function activateDocumentOriginal({user,identity,id,storageVersionId,requestId}){
  return withTransaction(async client=>{
    const params=[id],visible=documentVisibilitySql(user,identity,params,'d');
    const before=(await query(`select d.* from documents d where d.id=$1 and d.archived_at is null and ${visible} for update`,params,client)).rows[0];
    if(!before)throw problem(404,'NOT_FOUND','対象書類が見つかりません');
    const policy=await policyForCategory(before.category,client);requireDocumentPrivilege(user,identity,policy);
    if(before.storage_state!=='quarantine'||before.malware_scan_status!=='clean'){
      throw problem(409,'DOCUMENT_NOT_READY_FOR_ACTIVATION','安全確認済み隔離原本だけを有効化できます')
    }
    const after=(await query(`
      update documents
         set storage_state='active',storage_version_id=$2,activated_at=now(),updated_at=now(),version=version+1
       where id=$1
      returning *
    `,[id,storageVersionId||null],client)).rows[0];
    await query(`
      insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason)
      values('document',$1,$2,$3,'document_original_activated',$4::jsonb,$5::jsonb,'private original activated')
    `,[
      id,before.employee_id,user.id,
      JSON.stringify({storage_state:before.storage_state,malware_scan_status:before.malware_scan_status}),
      JSON.stringify({storage_state:after.storage_state,malware_scan_status:after.malware_scan_status})
    ],client);
    await query(`
      insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary)
      values($1,'document_finalized','document',$2,$3,'success',$4,$5)
    `,[user.id,id,before.employee_id,requestId,before.category+' / active'],client);
    return after
  })
}
async function auditDocumentDownload({user,documentId,employeeId,requestId,result,summary}){
  return query(`
    insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary)
    values($1,'document_download_authorized','document',$2,$3,$4,$5,$6)
  `,[user.id,documentId,employeeId,result,requestId,summary||'private short-lived authorization'])
}
module.exports={prepareDocumentUpload,reserveDocumentOriginal,activateDocumentOriginal,auditDocumentDownload};
