const crypto=require('crypto');
const {query,withTransaction}=require('./db');
const {scopeSql}=require('./employee-store');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function businessNo(prefix){return prefix+'-'+Date.now().toString(36).toUpperCase()+'-'+crypto.randomBytes(3).toString('hex').toUpperCase()}
function pagination(filters){
  const page=Math.max(1,Number.parseInt(filters.page,10)||1);
  const pageSize=Math.min(100,Math.max(1,Number.parseInt(filters.page_size,10)||20));
  return {page,pageSize,offset:(page-1)*pageSize}
}
function requireSafetyManager(user){
  if(!user||!['full','scoped'].includes(user.role_level))throw problem(403,'MANAGER_REQUIRED','安全管理の更新は管理者のみ実行できます');
  return user
}
function addTextFilter(where,params,value,sql){
  const v=String(value||'').trim();if(!v)return;
  params.push('%'+v+'%');where.push(sql.replaceAll('$Q','$'+params.length))
}
async function employeeSnapshotForUser(user,employeeId,client){
  const params=[employeeId],scope=scopeSql(user,params,'e');
  const r=await query(`select e.* from employees e where e.id=$1 and ${scope} limit 1`,params,client);
  if(!r.rows[0])throw problem(404,'NOT_FOUND','対象社員が見つかりません');
  return r.rows[0]
}
async function managerAssigneeForEmployee(employee,requestedUserId,client){
  const id=String(requestedUserId||'').trim();
  if(!id)return null;
  const r=await query(`
    select u.id,u.role_level,u.state
      from users u
     where u.id=$1
       and u.state='active'
       and u.role_level in ('full','scoped')
       and (
         u.role_level='full'
         or exists(
           select 1 from user_scopes s
            where s.user_id=u.id and s.office=$2 and s.department=$3
         )
       )
     limit 1
  `,[id,employee.office,employee.department],client);
  if(!r.rows[0])throw problem(422,'OWNER_USER_NOT_AUTHORIZED','担当者は対象社員を担当できる有効な管理者から選択してください');
  return r.rows[0]
}
async function scopedRecord(user,table,id,client,{includeArchived=false,forUpdate=false}={}){
  const params=[id],scope=scopeSql(user,params,'e'),archive=includeArchived?'':` and r.archived_at is null`,lock=forUpdate?' for update of r':'';
  const r=await query(`select r.* from ${table} r join employees e on e.id=r.employee_id where r.id=$1 and ${scope}${archive} limit 1${lock}`,params,client);
  if(!r.rows[0])throw problem(404,'NOT_FOUND','対象データが見つかりません');
  return r.rows[0]
}
async function audit(client,{actorUserId,action,entityType,entityId,employeeId,result='success',requestId,summary}){
  await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,$2,$3,$4,$5,$6,$7,$8)`,[actorUserId,action,entityType,String(entityId),employeeId,result,requestId,summary||''],client)
}
async function history(client,{entityType,entityId,employeeId,actorUserId,action,before,after,reason=''}){
  await query(`insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason) values($1,$2,$3,$4,$5,$6::jsonb,$7::jsonb,$8)`,[entityType,String(entityId),employeeId,actorUserId,action,JSON.stringify(before||{}),JSON.stringify(after||{}),reason],client)
}
function assertVersion(row,expected){
  if(Number(row.version)!==Number(expected))throw problem(409,'VERSION_CONFLICT','別の利用者が先に更新しています。最新データを読み直してください')
}
function editablePatch(body,allowed){
  const out={};for(const k of allowed)if(Object.prototype.hasOwnProperty.call(body||{},k))out[k]=body[k];return out
}
async function applyPatch(table,id,patch,client){
  const keys=Object.keys(patch);if(!keys.length)return null;
  const params=[id],sets=keys.map(k=>{params.push(patch[k]===undefined?null:patch[k]);return `${k}=$${params.length}`});
  const r=await query(`update ${table} set ${sets.join(',')},updated_at=now(),version=version+1 where id=$1 returning *`,params,client);
  return r.rows[0]||null
}

async function listAccidents(user,filters={}){
  requireSafetyManager(user);
  const params=[],where=[scopeSql(user,params,'e'),'a.archived_at is null'];
  if(filters.employee_id){params.push(String(filters.employee_id));where.push(`a.employee_id=$${params.length}`)}
  if(filters.phase){params.push(String(filters.phase));where.push(`a.phase=$${params.length}`)}
  if(filters.car_no){params.push(String(filters.car_no));where.push(`a.car_no=$${params.length}`)}
  if(filters.from){params.push(String(filters.from));where.push(`a.occurred_on>=$${params.length}`)}
  if(filters.to){params.push(String(filters.to));where.push(`a.occurred_on<=$${params.length}`)}
  addTextFilter(where,params,filters.q,`(a.accident_no ilike $Q or e.name ilike $Q or e.employee_no ilike $Q or a.address ilike $Q or a.summary ilike $Q or exists(select 1 from employee_number_history h where h.employee_id=e.id and h.old_employee_no ilike $Q))`);
  const {page,pageSize,offset}=pagination(filters);params.push(pageSize,offset);
  const r=await query(`select a.*,e.employee_no,e.name as employee_name,count(*) over()::int as _total from accidents a join employees e on e.id=a.employee_id where ${where.join(' and ')} order by a.occurred_on desc,a.id desc limit $${params.length-1} offset $${params.length}`,params);
  const total=r.rows[0]?Number(r.rows[0]._total):0;return {items:r.rows.map(({_total,...x})=>x),page,page_size:pageSize,total}
}
async function getAccident(user,id){requireSafetyManager(user);return scopedRecord(user,'accidents',id,null)}
async function createAccident({user,body,requestId}){
  requireSafetyManager(user);
  return withTransaction(async client=>{
    const e=await employeeSnapshotForUser(user,String(body.employee_id||''),client);
    const owner=await managerAssigneeForEmployee(e,body.owner_user_id||user.id,client);
    const occurred=String(body.occurred_on||'').trim(),address=String(body.address||'').trim(),summary=String(body.summary||'').trim();
    if(!occurred||!address||!summary)throw problem(422,'REQUIRED_FIELDS','発生日・場所・事故内容を入力してください');
    if(Object.prototype.hasOwnProperty.call(body||{},'phase')&&String(body.phase)!=='initial')throw problem(422,'USE_COMPLETION_ENDPOINT','事故の完了状態は専用操作を使用してください');
    const no=businessNo('ACC');
    const r=await query(`insert into accidents(accident_no,employee_id,office_at_record,department_at_record,employment_at_record,occurred_on,occurred_time,car_no,district,accident_type,fault_rate,opponent_repair_status,opponent_repair_cost,company_repair_status,company_repair_cost,address,summary,phase,cause,prevention,response_history,owner_user_id,next_action,followup_due) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19,$20,$21,$22,$23,$24) returning *`,
      [no,e.id,e.office,e.department,e.employment_type||null,occurred,body.occurred_time||null,body.car_no||null,body.district||null,body.accident_type||null,body.fault_rate??null,body.opponent_repair_status||null,body.opponent_repair_cost??null,body.company_repair_status||null,body.company_repair_cost??null,address,summary,'initial',body.cause||null,body.prevention||null,body.response_history||null,owner.id,body.next_action||null,body.followup_due||null],client);
    await audit(client,{actorUserId:user.id,action:'事故登録',entityType:'accident',entityId:r.rows[0].id,employeeId:e.id,requestId,summary:no});
    return r.rows[0]
  })
}
async function updateAccident({user,id,body,expectedVersion,requestId}){
  requireSafetyManager(user);
  return withTransaction(async client=>{
    const before=await scopedRecord(user,'accidents',id,client,{forUpdate:true});assertVersion(before,expectedVersion);
    if(before.phase==='completed')throw problem(409,'REOPEN_REQUIRED','完了済み事故は再開してから修正してください');
    if(Object.prototype.hasOwnProperty.call(body||{},'phase'))throw problem(422,'USE_COMPLETION_ENDPOINT','事故の完了・再開は専用操作を使用してください');
    const patch=editablePatch(body,['occurred_on','occurred_time','car_no','district','accident_type','fault_rate','opponent_repair_status','opponent_repair_cost','company_repair_status','company_repair_cost','address','summary','cause','prevention','response_history','owner_user_id','next_action','followup_due']);
    if(Object.prototype.hasOwnProperty.call(patch,'owner_user_id')&&patch.owner_user_id){
      const employee=await employeeSnapshotForUser(user,before.employee_id,client);
      patch.owner_user_id=(await managerAssigneeForEmployee(employee,patch.owner_user_id,client)).id
    }
    if(!Object.keys(patch).length)return before;
    const after=await applyPatch('accidents',id,patch,client);
    await history(client,{entityType:'accident',entityId:id,employeeId:before.employee_id,actorUserId:user.id,action:'update',before,after});
    await audit(client,{actorUserId:user.id,action:'事故更新',entityType:'accident',entityId:id,employeeId:before.employee_id,requestId,summary:'version '+before.version+' → '+after.version});
    return after
  })
}
async function completeAccident({user,id,expectedVersion,requestId}){
  requireSafetyManager(user);
  return withTransaction(async client=>{
    const before=await scopedRecord(user,'accidents',id,client,{forUpdate:true});assertVersion(before,expectedVersion);
    if(before.phase==='completed')throw problem(409,'ALREADY_COMPLETED','この事故はすでに完了しています');
    if(!String(before.cause||'').trim()||!String(before.prevention||'').trim()||!String(before.response_history||'').trim())throw problem(422,'COMPLETION_FIELDS_REQUIRED','原因・再発防止・対応履歴を入力してから完了してください');
    const after=(await query(`update accidents set phase='completed',completed_at=now(),completed_by_user_id=$2,updated_at=now(),version=version+1 where id=$1 returning *`,[id,user.id],client)).rows[0];
    await history(client,{entityType:'accident',entityId:id,employeeId:before.employee_id,actorUserId:user.id,action:'complete',before,after});
    await audit(client,{actorUserId:user.id,action:'事故完了',entityType:'accident',entityId:id,employeeId:before.employee_id,requestId,summary:before.accident_no});return after
  })
}
async function reopenAccident({user,id,expectedVersion,reason,requestId}){
  requireSafetyManager(user);if(!String(reason||'').trim())throw problem(422,'REASON_REQUIRED','再開理由を入力してください');
  return withTransaction(async client=>{
    const before=await scopedRecord(user,'accidents',id,client,{forUpdate:true});assertVersion(before,expectedVersion);
    if(before.phase!=='completed')throw problem(409,'NOT_COMPLETED','完了済み事故だけ再開できます');
    const after=(await query(`update accidents set phase='followup',completed_at=null,completed_by_user_id=null,updated_at=now(),version=version+1 where id=$1 returning *`,[id],client)).rows[0];
    await history(client,{entityType:'accident',entityId:id,employeeId:before.employee_id,actorUserId:user.id,action:'reopen',before,after,reason});
    await audit(client,{actorUserId:user.id,action:'事故再開',entityType:'accident',entityId:id,employeeId:before.employee_id,requestId,summary:String(reason)});return after
  })
}
async function archiveAccident({user,id,expectedVersion,reason,requestId}){
  requireSafetyManager(user);if(user.role_level!=='full')throw problem(403,'FULL_ADMIN_REQUIRED','事故のアーカイブは全社管理者のみ実行できます');if(!String(reason||'').trim())throw problem(422,'REASON_REQUIRED','アーカイブ理由を入力してください');
  return withTransaction(async client=>{
    const before=await scopedRecord(user,'accidents',id,client,{forUpdate:true});assertVersion(before,expectedVersion);
    const after=(await query(`update accidents set archived_at=now(),updated_at=now(),version=version+1 where id=$1 returning *`,[id],client)).rows[0];
    await history(client,{entityType:'accident',entityId:id,employeeId:before.employee_id,actorUserId:user.id,action:'archive',before,after,reason});
    await audit(client,{actorUserId:user.id,action:'事故アーカイブ',entityType:'accident',entityId:id,employeeId:before.employee_id,requestId,summary:String(reason)});return after
  })
}

async function listNearMisses(user,filters={}){
  const params=[],where=[scopeSql(user,params,'e'),'n.archived_at is null'];
  if(filters.employee_id){params.push(String(filters.employee_id));where.push(`n.employee_id=$${params.length}`)}
  if(filters.risk_level){params.push(String(filters.risk_level));where.push(`n.risk_level=$${params.length}`)}
  if(filters.from){params.push(String(filters.from));where.push(`n.reported_on>=$${params.length}`)}
  if(filters.to){params.push(String(filters.to));where.push(`n.reported_on<=$${params.length}`)}
  addTextFilter(where,params,filters.q,`(n.report_no ilike $Q or e.name ilike $Q or e.employee_no ilike $Q or n.summary ilike $Q or n.employee_no_at_report ilike $Q or exists(select 1 from employee_number_history h where h.employee_id=e.id and h.old_employee_no ilike $Q))`);
  const {page,pageSize,offset}=pagination(filters);params.push(pageSize,offset);
  const r=await query(`select n.*,e.employee_no,e.name as employee_name,count(*) over()::int as _total from near_misses n join employees e on e.id=n.employee_id where ${where.join(' and ')} order by n.reported_on desc,n.id desc limit $${params.length-1} offset $${params.length}`,params);
  const total=r.rows[0]?Number(r.rows[0]._total):0;return {items:r.rows.map(({_total,...x})=>x),page,page_size:pageSize,total}
}
async function getNearMiss(user,id){requireSafetyManager(user);return scopedRecord(user,'near_misses',id,null)}
async function createNearMiss({user,body,requestId}){
  if(!user)throw problem(403,'USER_REQUIRED','利用者を確認できません');
  return withTransaction(async client=>{
    const targetId=user.role_level==='self'?user.employee_id:String(body.employee_id||'');
    const e=await employeeSnapshotForUser(user,targetId,client);
    const occurred=String(body.occurred_on||'').trim(),reported=String(body.reported_on||'').trim(),summary=String(body.summary||'').trim();
    if(!occurred||!reported||!summary)throw problem(422,'REQUIRED_FIELDS','発生日・報告日・内容を入力してください');
    const no=businessNo('NEAR');
    const sourceType=String(body.source_type||'system').trim();
    if(!['system','google_form','paper'].includes(sourceType))throw problem(422,'SOURCE_TYPE_INVALID','入力経路を確認してください');
    const externalRef=String(body.external_ref||'').trim()||null;
    if(sourceType!=='system'&&!externalRef)throw problem(422,'EXTERNAL_REF_REQUIRED','Googleフォーム・紙の取込には受付番号を入力してください');
    if(externalRef){
      const dup=await query(`select id,report_no from near_misses where source_type=$1 and external_ref=$2 and archived_at is null limit 1`,[sourceType,externalRef],client);
      if(dup.rows[0])throw problem(409,'DUPLICATE_EXTERNAL_REF','同じ入力経路・受付番号のヒヤリが既に登録されています');
    }
    const r=await query(`insert into near_misses(report_no,employee_id,occurred_on,occurred_time,reported_on,car_no,summary,prevention,education,risk_level,cause_side,employee_no_at_report,office_at_report,department_at_report,employment_at_report,location_tags,situation_tags,road_tags,target_tags,internal_factors,source_type,external_ref) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16::jsonb,$17::jsonb,$18::jsonb,$19::jsonb,$20::jsonb,$21,$22) returning *`,
      [no,e.id,occurred,body.occurred_time||null,reported,body.car_no||null,summary,body.prevention||null,body.education||null,body.risk_level||null,body.cause_side||null,e.employee_no,e.office,e.department,e.employment_type||null,JSON.stringify(body.location_tags||[]),JSON.stringify(body.situation_tags||[]),JSON.stringify(body.road_tags||[]),JSON.stringify(body.target_tags||[]),JSON.stringify(body.internal_factors||[]),sourceType,externalRef],client);
    await audit(client,{actorUserId:user.id,action:'ヒヤリ登録',entityType:'near_miss',entityId:r.rows[0].id,employeeId:e.id,requestId,summary:no+' / '+sourceType+(externalRef?' / '+externalRef:'')});return r.rows[0]
  })
}
async function updateNearMiss({user,id,body,expectedVersion,requestId}){
  requireSafetyManager(user);return withTransaction(async client=>{
    const before=await scopedRecord(user,'near_misses',id,client,{forUpdate:true});assertVersion(before,expectedVersion);
    const patch=editablePatch(body,['occurred_on','occurred_time','reported_on','car_no','summary','prevention','education','risk_level','cause_side','location_tags','situation_tags','road_tags','target_tags','internal_factors','source_type','external_ref']);
    for(const k of ['location_tags','situation_tags','road_tags','target_tags','internal_factors'])if(k in patch)patch[k]=JSON.stringify(patch[k]||[]);
    const keys=Object.keys(patch);if(!keys.length)return before;
    const params=[id],sets=keys.map(k=>{params.push(patch[k]);return `${k}=$${params.length}${k.endsWith('_tags')||k==='internal_factors'?'::jsonb':''}`});
    const after=(await query(`update near_misses set ${sets.join(',')},updated_at=now(),version=version+1 where id=$1 returning *`,params,client)).rows[0];
    await history(client,{entityType:'near_miss',entityId:id,employeeId:before.employee_id,actorUserId:user.id,action:'update',before,after});
    await audit(client,{actorUserId:user.id,action:'ヒヤリ更新',entityType:'near_miss',entityId:id,employeeId:before.employee_id,requestId,summary:before.report_no});return after
  })
}
async function archiveNearMiss({user,id,expectedVersion,reason,requestId}){
  requireSafetyManager(user);if(user.role_level!=='full')throw problem(403,'FULL_ADMIN_REQUIRED','ヒヤリのアーカイブは全社管理者のみ実行できます');if(!String(reason||'').trim())throw problem(422,'REASON_REQUIRED','アーカイブ理由を入力してください');
  return withTransaction(async client=>{const before=await scopedRecord(user,'near_misses',id,client,{forUpdate:true});assertVersion(before,expectedVersion);const after=(await query(`update near_misses set archived_at=now(),updated_at=now(),version=version+1 where id=$1 returning *`,[id],client)).rows[0];await history(client,{entityType:'near_miss',entityId:id,employeeId:before.employee_id,actorUserId:user.id,action:'archive',before,after,reason});await audit(client,{actorUserId:user.id,action:'ヒヤリアーカイブ',entityType:'near_miss',entityId:id,employeeId:before.employee_id,requestId,summary:String(reason)});return after})
}

async function listComplaints(user,filters={}){
  requireSafetyManager(user);
  const params=[],where=[scopeSql(user,params,'e'),'c.archived_at is null'];
  if(filters.employee_id){params.push(String(filters.employee_id));where.push(`c.employee_id=$${params.length}`)}
  if(filters.status){params.push(String(filters.status));where.push(`c.status=$${params.length}`)}
  if(filters.from){params.push(String(filters.from));where.push(`c.responded_on>=$${params.length}`)}
  if(filters.to){params.push(String(filters.to));where.push(`c.responded_on<=$${params.length}`)}
  addTextFilter(where,params,filters.q,`(c.complaint_no ilike $Q or e.name ilike $Q or e.employee_no ilike $Q or c.summary ilike $Q or exists(select 1 from employee_number_history h where h.employee_id=e.id and h.old_employee_no ilike $Q))`);
  const {page,pageSize,offset}=pagination(filters);params.push(pageSize,offset);
  const r=await query(`select c.*,e.employee_no,e.name as employee_name,count(*) over()::int as _total from complaints c join employees e on e.id=c.employee_id where ${where.join(' and ')} order by c.responded_on desc,c.id desc limit $${params.length-1} offset $${params.length}`,params);
  const total=r.rows[0]?Number(r.rows[0]._total):0;return {items:r.rows.map(({_total,...x})=>x),page,page_size:pageSize,total}
}
async function getComplaint(user,id){requireSafetyManager(user);return scopedRecord(user,'complaints',id,null)}
async function createComplaint({user,body,requestId}){
  requireSafetyManager(user);return withTransaction(async client=>{
    const e=await employeeSnapshotForUser(user,String(body.employee_id||''),client);
    const owner=await managerAssigneeForEmployee(e,body.owner_user_id||user.id,client);
    const responded=String(body.responded_on||'').trim(),summary=String(body.summary||'').trim();
    if(!responded||!summary)throw problem(422,'REQUIRED_FIELDS','対応日・内容を入力してください');
    if(Object.prototype.hasOwnProperty.call(body||{},'status')&&String(body.status)!=='open')throw problem(422,'USE_COMPLETION_ENDPOINT','苦情の完了状態は専用操作を使用してください');
    const no=businessNo('CMP');
    const r=await query(`insert into complaints(complaint_no,employee_id,office_at_record,department_at_record,employment_at_record,responded_on,responded_time,responder,occurrence_date,occurrence_time,car_no,customer_alias,summary,rank,owner_user_id,guidance_content,next_action,followup_due,status) values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18,$19) returning *`,
      [no,e.id,e.office,e.department,e.employment_type||null,responded,body.responded_time||null,body.responder||null,body.occurrence_date||null,body.occurrence_time||null,body.car_no||null,body.customer_alias||null,summary,body.rank||'unrated',owner.id,body.guidance_content||null,body.next_action||null,body.followup_due||null,'open'],client);
    await audit(client,{actorUserId:user.id,action:'苦情登録',entityType:'complaint',entityId:r.rows[0].id,employeeId:e.id,requestId,summary:no});return r.rows[0]
  })
}
async function updateComplaint({user,id,body,expectedVersion,requestId}){
  requireSafetyManager(user);return withTransaction(async client=>{
    const before=await scopedRecord(user,'complaints',id,client,{forUpdate:true});assertVersion(before,expectedVersion);
    if(before.status==='completed')throw problem(409,'REOPEN_REQUIRED','完了済み苦情は再開してから修正してください');
    if(Object.prototype.hasOwnProperty.call(body||{},'status'))throw problem(422,'USE_COMPLETION_ENDPOINT','苦情の完了・再開は専用操作を使用してください');
    const patch=editablePatch(body,['responded_on','responded_time','responder','occurrence_date','occurrence_time','car_no','customer_alias','summary','rank','owner_user_id','guidance_content','next_action','followup_due']);
    if(Object.prototype.hasOwnProperty.call(patch,'owner_user_id')&&patch.owner_user_id){
      const employee=await employeeSnapshotForUser(user,before.employee_id,client);
      patch.owner_user_id=(await managerAssigneeForEmployee(employee,patch.owner_user_id,client)).id
    }
    if(!Object.keys(patch).length)return before;const after=await applyPatch('complaints',id,patch,client);
    await history(client,{entityType:'complaint',entityId:id,employeeId:before.employee_id,actorUserId:user.id,action:'update',before,after});
    await audit(client,{actorUserId:user.id,action:'苦情更新',entityType:'complaint',entityId:id,employeeId:before.employee_id,requestId,summary:before.complaint_no});return after
  })
}
async function completeComplaint({user,id,expectedVersion,requestId}){
  requireSafetyManager(user);return withTransaction(async client=>{
    const before=await scopedRecord(user,'complaints',id,client,{forUpdate:true});assertVersion(before,expectedVersion);
    if(before.status==='completed')throw problem(409,'ALREADY_COMPLETED','この苦情はすでに完了しています');
    if(!String(before.guidance_content||'').trim()||!String(before.next_action||'').trim())throw problem(422,'COMPLETION_FIELDS_REQUIRED','指導内容・対応内容を確認してから完了してください');
    const after=(await query(`update complaints set status='completed',completed_at=now(),completed_by_user_id=$2,updated_at=now(),version=version+1 where id=$1 returning *`,[id,user.id],client)).rows[0];
    await history(client,{entityType:'complaint',entityId:id,employeeId:before.employee_id,actorUserId:user.id,action:'complete',before,after});await audit(client,{actorUserId:user.id,action:'苦情完了',entityType:'complaint',entityId:id,employeeId:before.employee_id,requestId,summary:before.complaint_no});return after
  })
}
async function reopenComplaint({user,id,expectedVersion,reason,requestId}){
  requireSafetyManager(user);if(!String(reason||'').trim())throw problem(422,'REASON_REQUIRED','再開理由を入力してください');return withTransaction(async client=>{
    const before=await scopedRecord(user,'complaints',id,client,{forUpdate:true});assertVersion(before,expectedVersion);if(before.status!=='completed')throw problem(409,'NOT_COMPLETED','完了済み苦情だけ再開できます');const after=(await query(`update complaints set status='open',completed_at=null,completed_by_user_id=null,updated_at=now(),version=version+1 where id=$1 returning *`,[id],client)).rows[0];
    await history(client,{entityType:'complaint',entityId:id,employeeId:before.employee_id,actorUserId:user.id,action:'reopen',before,after,reason});await audit(client,{actorUserId:user.id,action:'苦情再開',entityType:'complaint',entityId:id,employeeId:before.employee_id,requestId,summary:String(reason)});return after
  })
}
async function archiveComplaint({user,id,expectedVersion,reason,requestId}){
  requireSafetyManager(user);if(user.role_level!=='full')throw problem(403,'FULL_ADMIN_REQUIRED','苦情のアーカイブは全社管理者のみ実行できます');if(!String(reason||'').trim())throw problem(422,'REASON_REQUIRED','アーカイブ理由を入力してください');return withTransaction(async client=>{
    const before=await scopedRecord(user,'complaints',id,client,{forUpdate:true});assertVersion(before,expectedVersion);const after=(await query(`update complaints set archived_at=now(),updated_at=now(),version=version+1 where id=$1 returning *`,[id],client)).rows[0];
    await history(client,{entityType:'complaint',entityId:id,employeeId:before.employee_id,actorUserId:user.id,action:'archive',before,after,reason});await audit(client,{actorUserId:user.id,action:'苦情アーカイブ',entityType:'complaint',entityId:id,employeeId:before.employee_id,requestId,summary:String(reason)});return after
  })
}
module.exports={managerAssigneeForEmployee,listAccidents,getAccident,createAccident,updateAccident,completeAccident,reopenAccident,archiveAccident,listNearMisses,getNearMiss,createNearMiss,updateNearMiss,archiveNearMiss,listComplaints,getComplaint,createComplaint,updateComplaint,completeComplaint,reopenComplaint,archiveComplaint,requireSafetyManager};
