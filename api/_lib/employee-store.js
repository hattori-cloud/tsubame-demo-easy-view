const {query,withTransaction}=require('./db');
const {lockFullAdminContinuity,requireOtherActiveFullAdmin}=require('./admin-continuity');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function scopeSql(user,params,alias='e'){
  if(user.role_level==='full')return 'true';
  if(user.role_level==='self'){params.push(user.employee_id);return `${alias}.id=$${params.length}`}
  if(user.role_level==='scoped'){
    const scopes=user.scopes||[];
    if(!scopes.length)return 'false';
    return '('+scopes.map(s=>{params.push(s.office,s.department);return `(${alias}.office=$${params.length-1} and ${alias}.department=$${params.length})`}).join(' or ')+')'
  }
  return 'false'
}
async function listEmployeesForUser(user,filters={}){
  const params=[],where=[scopeSql(user,params)];
  const q=String(filters.q||'').trim(),office=String(filters.office||'').trim(),department=String(filters.department||'').trim(),status=String(filters.status||'').trim();
  if(office){params.push(office);where.push(`e.office=$${params.length}`)}
  if(department){params.push(department);where.push(`e.department=$${params.length}`)}
  if(status){params.push(status);where.push(`e.lifecycle_status=$${params.length}`)}
  if(q){
    params.push('%'+q+'%');
    const n=params.length;
    where.push(`(e.employee_no ilike $${n} or e.name ilike $${n} or e.furigana ilike $${n} or e.office ilike $${n} or e.department ilike $${n} or exists(select 1 from employee_number_history h where h.employee_id=e.id and h.old_employee_no ilike $${n}))`)
  }
  const page=Math.max(1,Number.parseInt(filters.page,10)||1),pageSize=Math.min(100,Math.max(1,Number.parseInt(filters.page_size,10)||50)),offset=(page-1)*pageSize;
  params.push(pageSize,offset);
  const sizePos=params.length-1,offsetPos=params.length;
  const sql=`select e.*,count(*) over()::int as _total from employees e where ${where.join(' and ')} order by e.employee_no,e.id limit $${sizePos} offset $${offsetPos}`;
  const r=await query(sql,params);
  const total=r.rows[0]?Number(r.rows[0]._total):0;
  return {items:r.rows.map(({_total,...x})=>x),page,page_size:pageSize,total}
}
async function getEmployeeForUser(user,id){
  const params=[id],scope=scopeSql(user,params);
  const r=await query(`select e.* from employees e where e.id=$1 and ${scope} limit 1`,params);
  if(!r.rows[0])throw problem(404,'NOT_FOUND','対象データが見つかりません');
  return r.rows[0]
}
function requireEmployeeManager(user){
  if(!user||!['full','scoped'].includes(user.role_level))throw problem(403,'MANAGER_REQUIRED','社員情報の更新は管理者のみ実行できます');
  return user
}
async function createEmployee({user,body,requestId}){
  if(!user||user.role_level!=='full')throw problem(403,'FULL_ADMIN_REQUIRED','社員登録は全社管理者のみ実行できます');
  const no=String(body.employee_no||'').trim(),name=String(body.name||'').trim(),office=String(body.office||'').trim(),department=String(body.department||'').trim();
  if(!no||!name||!office||!department||no.length>64||/\s/.test(no))throw problem(422,'REQUIRED_FIELDS','社員番号・氏名・事業所・部署を確認してください');
  return withTransaction(async client=>{
    const current=await query('select id from employees where employee_no=$1 limit 1',[no],client);
    const historical=await query('select employee_id from employee_number_history where old_employee_no=$1 limit 1',[no],client);
    if(current.rows[0]||historical.rows[0])throw problem(409,'EMPLOYEE_NO_ALREADY_USED','その社員番号は現在番号または旧番号として使用済みです');
    const r=await query(`
      insert into employees(employee_no,name,furigana,office,department,position,taxi_section,team,employment_type,lifecycle_status,work_pattern,main_license,license_expiry,health_check_due,aptitude_due,safety_state,eligibility,hired_on)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18)
      returning *
    `,[no,name,body.furigana||null,office,department,body.position||null,body.taxi_section||null,body.team||null,body.employment_type||null,body.lifecycle_status||'active',body.work_pattern||null,body.main_license||null,body.license_expiry||null,body.health_check_due||null,body.aptitude_due||null,body.safety_state||null,body.eligibility||null,body.hired_on||null],client);
    const employee=r.rows[0];
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1::uuid,'社員登録','employee',$2::uuid::text,$2::uuid,'success',$3,$4)`,[user.id,employee.id,requestId,no+' '+name],client);
    return employee
  })
}
async function updateEmployee({user,employeeId,body,expectedVersion,requestId}){
  requireEmployeeManager(user);
  return withTransaction(async client=>{
    const params=[employeeId],scope=scopeSql(user,params,'e');
    const before=(await query(`select e.* from employees e where e.id=$1 and ${scope} for update`,params,client)).rows[0];
    if(!before)throw problem(404,'NOT_FOUND','対象社員が見つかりません');
    if(Number(before.version)!==Number(expectedVersion))throw problem(409,'VERSION_CONFLICT','別の利用者が先に更新しています。最新データを読み直してください');
    if(Object.prototype.hasOwnProperty.call(body||{},'employee_no'))throw problem(422,'USE_RENUMBER_ENDPOINT','社員番号変更は専用操作を使用してください');
    if(['office','department','lifecycle_status','retired_on'].some(k=>Object.prototype.hasOwnProperty.call(body||{},k)))throw problem(422,'USE_TRANSITION_ENDPOINT','所属・在籍状態の変更は異動/退職操作を使用してください');
    const safetyKeys=['safety_state','eligibility'];
    if(safetyKeys.some(k=>Object.prototype.hasOwnProperty.call(body||{},k))&&user.role_level!=='full'&&!user.safety_authority)throw problem(403,'SAFETY_AUTHORITY_REQUIRED','安全判断項目の変更権限がありません');
    const allowed=['name','furigana','position','taxi_section','team','employment_type','work_pattern','main_license','license_expiry','health_check_due','aptitude_due','safety_state','eligibility','hired_on'];
    const patch={};for(const k of allowed)if(Object.prototype.hasOwnProperty.call(body||{},k))patch[k]=body[k]===undefined?null:body[k];
    if('name' in patch&&!String(patch.name||'').trim())throw problem(422,'NAME_REQUIRED','氏名を入力してください');
    const changed=Object.entries(patch).filter(([k,v])=>String(before[k]??'')!==String(v??''));
    if(!changed.length)return before;
    const values=[employeeId],sets=changed.map(([k,v])=>{values.push(v);return `${k}=$${values.length}`});
    const after=(await query(`update employees set ${sets.join(',')},updated_at=now(),version=version+1 where id=$1 returning *`,values,client)).rows[0];
    await query(`insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason) values('employee',$1::uuid::text,$1::uuid,$2::uuid,'profile_update',$3::jsonb,$4::jsonb,'通常編集')`,[employeeId,user.id,JSON.stringify(Object.fromEntries(changed.map(([k])=>[k,before[k]]))),JSON.stringify(Object.fromEntries(changed))],client);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1::uuid,'社員情報更新','employee',$2::uuid::text,$2::uuid,'success',$3,$4)`,[user.id,employeeId,requestId,changed.map(([k])=>k).join(',')],client);
    return after
  })
}
async function changeEmployeeNumber({employeeId,newEmployeeNo,reason,actorUserId,expectedVersion,requestId}){
  return withTransaction(async client=>{
    const r=await query('select * from employees where id=$1 for update',[employeeId],client);
    const employee=r.rows[0];
    if(!employee)throw problem(404,'NOT_FOUND','対象社員が見つかりません');
    if(Number(employee.version)!==Number(expectedVersion))throw problem(409,'VERSION_CONFLICT','別の利用者が先に更新しています。最新データを読み直してください');
    const next=String(newEmployeeNo||'').trim();
    if(!next||next.length>64||/\s/.test(next))throw problem(422,'INVALID_EMPLOYEE_NO','社員番号を確認してください');
    if(next===employee.employee_no)throw problem(422,'EMPLOYEE_NO_UNCHANGED','現在と同じ社員番号です');
    const current=await query('select id from employees where employee_no=$1 and id<>$2 limit 1',[next,employeeId],client);
    const history=await query('select employee_id from employee_number_history where old_employee_no=$1 and employee_id<>$2 limit 1',[next,employeeId],client);
    if(current.rows[0]||history.rows[0])throw problem(409,'EMPLOYEE_NO_ALREADY_USED','その社員番号は現在番号または他社員の旧番号として使用済みです');
    await query(`insert into employee_number_history(employee_id,old_employee_no,new_employee_no,reason,changed_by_user_id) values($1,$2,$3,$4,$5)`,[employeeId,employee.employee_no,next,reason,actorUserId],client);
    const updated=(await query(`update employees set employee_no=$2,updated_at=now(),version=version+1 where id=$1 returning *`,[employeeId,next],client)).rows[0];
    await query(`insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason) values('employee',$1::uuid::text,$1::uuid,$2::uuid,'employee_number_change',$3::jsonb,$4::jsonb,$5)`,[employeeId,actorUserId,JSON.stringify({employee_no:employee.employee_no}),JSON.stringify({employee_no:next}),reason],client);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1::uuid,'社員番号変更','employee',$2::uuid::text,$2::uuid,'success',$3,$4)`,[actorUserId,employeeId,requestId,employee.employee_no+' → '+next],client);
    return updated
  })
}
async function transitionEmployee({employeeId,target,reason,handoffNote,actorUserId,expectedVersion,requestId}){
  return withTransaction(async client=>{
    if(String(target?.lifecycle_status||'')==='retired')await lockFullAdminContinuity(client);
    const r=await query('select * from employees where id=$1 for update',[employeeId],client);
    const before=r.rows[0];
    if(!before)throw problem(404,'NOT_FOUND','対象社員が見つかりません');
    if(Number(before.version)!==Number(expectedVersion))throw problem(409,'VERSION_CONFLICT','別の利用者が先に更新しています。最新データを読み直してください');
    const next={
      office:String(target?.office??before.office).trim(),department:String(target?.department??before.department).trim(),
      lifecycle_status:String(target?.lifecycle_status??before.lifecycle_status).trim(),retired_on:target?.retired_on??before.retired_on
    };
    if(!['active','leave','retirement_planned','retired'].includes(next.lifecycle_status))throw problem(422,'INVALID_LIFECYCLE_STATUS','在籍状態を確認してください');
    if(!next.office||!next.department)throw problem(422,'INVALID_ASSIGNMENT','事業所・部署を確認してください');
    if(next.lifecycle_status==='retired'&&!next.retired_on)next.retired_on=new Date().toISOString().slice(0,10);
    const updated=(await query(`update employees set office=$2,department=$3,lifecycle_status=$4,retired_on=$5,updated_at=now(),version=version+1 where id=$1 returning *`,[employeeId,next.office,next.department,next.lifecycle_status,next.retired_on],client)).rows[0];
    await query(`insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason) values('employee',$1::uuid::text,$1::uuid,$2::uuid,'employee_transition',$3::jsonb,$4::jsonb,$5)`,[employeeId,actorUserId,JSON.stringify({office:before.office,department:before.department,lifecycle_status:before.lifecycle_status,retired_on:before.retired_on}),JSON.stringify(next),reason||handoffNote||''],client);
    if(next.lifecycle_status==='retired'){
      const accounts=await query('select id,state,role_level from users where employee_id=$1 order by id',[employeeId],client);
      const activeFull=accounts.rows.filter(u=>u.state==='active'&&u.role_level==='full').map(u=>u.id);
      if(activeFull.length)await requireOtherActiveFullAdmin(activeFull,client);
      for(const u of accounts.rows){
        await query(`update mfa_challenges set verified_at=now() where user_id=$1 and verified_at is null`,[u.id],client);
        await query(`update password_reset_tokens set used_at=now() where user_id=$1 and used_at is null`,[u.id],client);
        const changed=await query(`update users set state='suspended',updated_at=now(),version=version+1 where id=$1 and state<>'suspended' returning id`,[u.id],client);
        if(changed.rows[0])await query(`insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason) values('user',$1,$2,$3,'retirement_auto_suspend',$4::jsonb,$5::jsonb,$6)`,[u.id,employeeId,actorUserId,JSON.stringify({state:u.state}),JSON.stringify({state:'suspended'}),reason||handoffNote||'退職連動'],client);
        const revoked=await query(`update auth_sessions set revoked_at=now(),revoke_reason='employee_retired' where user_id=$1 and revoked_at is null returning id`,[u.id],client);
        await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'退職連動利用者停止','user',$2,$3,'success',$4,$5)`,[actorUserId,u.id,employeeId,requestId,(changed.rows[0]?'active → suspended':'suspended維持')+' / sessions '+revoked.rows.length+'件失効 / 保留中認証を無効化'],client)
      }
    }
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1::uuid,'社員状態変更','employee',$2::uuid::text,$2::uuid,'success',$3,$4)`,[actorUserId,employeeId,requestId,before.lifecycle_status+' → '+next.lifecycle_status],client);
    return updated
  })
}
module.exports={listEmployeesForUser,getEmployeeForUser,createEmployee,updateEmployee,changeEmployeeNumber,transitionEmployee,scopeSql,requireEmployeeManager};
