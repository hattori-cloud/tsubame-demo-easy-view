const {query,withTransaction}=require('./db');
const {scopeSql}=require('./employee-store');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function assertVersion(row,expected){if(Number(row.version)!==Number(expected))throw problem(409,'VERSION_CONFLICT','別の利用者が先に更新しています。最新データを読み直してください')}
function manager(user){if(!user||!['full','scoped'].includes(user.role_level))throw problem(403,'MANAGER_REQUIRED','資格・書類の更新は管理者のみ実行できます');return user}
async function employeeForUser(user,employeeId,client=null){
  const params=[employeeId],scope=scopeSql(user,params,'e');
  const r=await query(`select e.* from employees e where e.id=$1 and ${scope} limit 1`,params,client);
  if(!r.rows[0])throw problem(404,'NOT_FOUND','対象社員が見つかりません');
  return r.rows[0]
}
function documentVisibilitySql(user,identity,params,alias='d'){
  if(user.role_level==='full'){
    if(identity?.mfa)return 'true';
    return `${alias}.security_class<>'strict'`
  }
  if(user.role_level==='self'){
    params.push(user.employee_id);
    return `(${alias}.employee_id=$${params.length} and ${alias}.access_level='self_allowed' and ${alias}.security_class<>'strict')`
  }
  if(user.role_level==='scoped'){
    const scope=scopeSql(user,params,'e');
    return `(${alias}.access_level in ('self_allowed','scope_admin') and ${alias}.security_class<>'strict' and exists(select 1 from employees e where e.id=${alias}.employee_id and ${scope}))`
  }
  return 'false'
}
async function listDocumentPolicies(user){
  manager(user);
  const r=await query(`
    select category,original_handling,security_class,access_level,verification_required,retention_years,retention_note,version
      from document_policy_rules
     order by category
  `);
  return r.rows
}
async function listCredentials(user,identity,employeeId){
  const employee=await employeeForUser(user,employeeId);
  const qualifications=(await query(`select * from qualifications where employee_id=$1 and archived_at is null order by expiry nulls last,name,id`,[employee.id])).rows;
  const params=[employee.id],visible=documentVisibilitySql(user,identity,params,'d');
  const documents=(await query(`
    select d.id,d.employee_id,d.qualification_id,d.category,d.name,d.kind,d.registered_on,d.expiry,d.status,d.security_class,d.access_level,d.original_handling,d.verification_required,d.paper_location,d.retention_until,d.storage_state,d.malware_scan_status,d.verified_by_user_id,d.replaced_from_document_id,d.replaced_by_document_id,d.archived_at,d.created_at,d.updated_at,d.version
      from documents d
     where d.employee_id=$1 and d.archived_at is null and ${visible}
  order by d.expiry nulls last,d.registered_on desc,d.id
  `,params)).rows;
  return {employee:{id:employee.id,employee_no:employee.employee_no,name:employee.name},qualifications,documents}
}
async function createQualification({user,body,requestId}){
  manager(user);
  return withTransaction(async client=>{
    const employee=await employeeForUser(user,String(body.employee_id||''),client),name=String(body.name||'').trim();
    if(!name)throw problem(422,'NAME_REQUIRED','資格名を入力してください');
    const row=(await query(`insert into qualifications(employee_id,name,certificate_no,expiry,status,evidence_requirement) values($1,$2,$3,$4,$5,$6) returning *`,[employee.id,name,body.certificate_no||null,body.expiry||null,body.status||'active',body.evidence_requirement||'unset'],client)).rows[0];
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'資格登録','qualification',$2,$3,'success',$4,$5)`,[user.id,row.id,employee.id,requestId,name],client);
    return row
  })
}
async function updateQualification({user,id,body,expectedVersion,requestId}){
  manager(user);
  return withTransaction(async client=>{
    const params=[id],scope=scopeSql(user,params,'e');
    const before=(await query(`select q.* from qualifications q join employees e on e.id=q.employee_id where q.id=$1 and q.archived_at is null and ${scope} for update`,params,client)).rows[0];
    if(!before)throw problem(404,'NOT_FOUND','対象資格が見つかりません');assertVersion(before,expectedVersion);
    const allowed=['name','certificate_no','expiry','status','evidence_requirement'],patch={};
    for(const k of allowed)if(Object.prototype.hasOwnProperty.call(body||{},k))patch[k]=body[k]===undefined?null:body[k];
    if('name' in patch&&!String(patch.name||'').trim())throw problem(422,'NAME_REQUIRED','資格名を入力してください');
    const changed=Object.entries(patch).filter(([k,v])=>String(before[k]??'')!==String(v??''));if(!changed.length)return before;
    const vals=[id],sets=changed.map(([k,v])=>{vals.push(v);return `${k}=$${vals.length}`});
    const after=(await query(`update qualifications set ${sets.join(',')},updated_at=now(),version=version+1 where id=$1 returning *`,vals,client)).rows[0];
    await query(`insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason) values('qualification',$1,$2,$3,'update',$4::jsonb,$5::jsonb,'資格更新')`,[id,before.employee_id,user.id,JSON.stringify(Object.fromEntries(changed.map(([k])=>[k,before[k]]))),JSON.stringify(Object.fromEntries(changed))],client);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'資格更新','qualification',$2,$3,'success',$4,$5)`,[user.id,id,before.employee_id,requestId,changed.map(([k])=>k).join(',')],client);
    return after
  })
}
async function policyForCategory(category,client=null){
  const r=await query('select * from document_policy_rules where category=$1 limit 1',[category],client);
  if(!r.rows[0])throw problem(422,'DOCUMENT_POLICY_REQUIRED','書類区分の会社ルールが未設定です');
  return r.rows[0]
}
function requireDocumentPrivilege(user,identity,policy){
  if(policy.security_class==='strict'&&(user.role_level!=='full'||!identity?.mfa))throw problem(403,'STRICT_DOCUMENT_MFA_REQUIRED','厳格書類は全社管理者のMFA確認済みセッションのみ操作できます');
  if(policy.access_level==='full_admin'&&user.role_level!=='full')throw problem(403,'FULL_ADMIN_REQUIRED','この書類区分は全社管理者のみ操作できます')
}
async function createDocumentMetadata({user,identity,body,requestId}){
  manager(user);
  return withTransaction(async client=>{
    const employee=await employeeForUser(user,String(body.employee_id||''),client),category=String(body.category||'').trim(),name=String(body.name||'').trim();
    if(!category||!name)throw problem(422,'REQUIRED_FIELDS','書類区分・書類名を入力してください');
    const policy=await policyForCategory(category,client);requireDocumentPrivilege(user,identity,policy);
    const qualificationId=body.qualification_id?String(body.qualification_id):null;
    if(qualificationId){
      const linked=await query('select id from qualifications where id=$1 and employee_id=$2 and archived_at is null limit 1',[qualificationId,employee.id],client);
      if(!linked.rows[0])throw problem(422,'QUALIFICATION_EMPLOYEE_MISMATCH','選択した資格は対象社員の有効な資格ではありません')
    }
    if(['electronic_original','paper_and_electronic'].includes(policy.original_handling))throw problem(409,'ELECTRONIC_ORIGINAL_REQUIRED','この書類区分は原本アップロード経路を使用してください');
    if(policy.original_handling==='company_paper_original'&&!String(body.paper_location||'').trim())throw problem(422,'PAPER_LOCATION_REQUIRED','会社保管の紙原本は保管場所を入力してください');
    const row=(await query(`
      insert into documents(employee_id,qualification_id,category,name,kind,registered_on,expiry,status,security_class,access_level,original_handling,verification_required,paper_location,retention_until,storage_state)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,'not_uploaded') returning *
    `,[employee.id,qualificationId,category,name,body.kind||null,body.registered_on||new Date().toISOString().slice(0,10),body.expiry||null,body.status||'pending',policy.security_class,policy.access_level,policy.original_handling,policy.verification_required,body.paper_location||null,body.retention_until||null],client)).rows[0];
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'書類メタデータ登録','document',$2,$3,'success',$4,$5)`,[user.id,row.id,employee.id,requestId,category+' / '+name],client);
    return row
  })
}
async function getDocumentForAccess(user,identity,id){
  const params=[id],visible=documentVisibilitySql(user,identity,params,'d');
  const r=await query(`select d.* from documents d where d.id=$1 and d.archived_at is null and ${visible} limit 1`,params);
  if(!r.rows[0])throw problem(404,'NOT_FOUND','対象書類が見つかりません');
  return r.rows[0]
}
async function documentForUpdate(user,identity,id,client){
  const params=[id],visible=documentVisibilitySql(user,identity,params,'d');
  const r=await query(`select d.* from documents d where d.id=$1 and d.archived_at is null and ${visible} for update`,params,client);
  if(!r.rows[0])throw problem(404,'NOT_FOUND','対象書類が見つかりません');
  return r.rows[0]
}
async function updateDocumentMetadata({user,identity,id,body,expectedVersion,requestId}){
  manager(user);
  return withTransaction(async client=>{
    const before=await documentForUpdate(user,identity,id,client);assertVersion(before,expectedVersion);
    const policy=await policyForCategory(before.category,client);requireDocumentPrivilege(user,identity,policy);
    const forbidden=['storage_key','storage_version_id','content_sha256','malware_scan_status','malware_scanned_at','storage_state','uploaded_at','uploaded_by_user_id','activated_at'];
    if(forbidden.some(k=>Object.prototype.hasOwnProperty.call(body||{},k)))throw problem(422,'SERVER_CONTROLLED_STORAGE_FIELDS','保存先・ハッシュ・検査状態はサーバー管理項目です');
    const allowed=['name','kind','registered_on','expiry','status','paper_location','retention_until','retention_review_note'],patch={};
    for(const k of allowed)if(Object.prototype.hasOwnProperty.call(body||{},k))patch[k]=body[k]===undefined?null:body[k];
    const changed=Object.entries(patch).filter(([k,v])=>String(before[k]??'')!==String(v??''));if(!changed.length)return before;
    const vals=[id],sets=changed.map(([k,v])=>{vals.push(v);return `${k}=$${vals.length}`});
    const after=(await query(`update documents set ${sets.join(',')},updated_at=now(),version=version+1 where id=$1 returning *`,vals,client)).rows[0];
    await query(`insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason) values('document',$1,$2,$3,'metadata_update',$4::jsonb,$5::jsonb,'書類メタデータ更新')`,[id,before.employee_id,user.id,JSON.stringify(Object.fromEntries(changed.map(([k])=>[k,before[k]]))),JSON.stringify(Object.fromEntries(changed))],client);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'書類メタデータ更新','document',$2,$3,'success',$4,$5)`,[user.id,id,before.employee_id,requestId,changed.map(([k])=>k).join(',')],client);
    return after
  })
}
module.exports={listDocumentPolicies,listCredentials,createQualification,updateQualification,createDocumentMetadata,updateDocumentMetadata,policyForCategory,requireDocumentPrivilege,documentVisibilitySql,employeeForUser,getDocumentForAccess};
