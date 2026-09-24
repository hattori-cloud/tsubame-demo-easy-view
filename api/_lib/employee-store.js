const {query,withTransaction}=require('./db');

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
    await query(`insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason) values('employee',$1,$1,$2,'employee_number_change',$3::jsonb,$4::jsonb,$5)`,[employeeId,actorUserId,JSON.stringify({employee_no:employee.employee_no}),JSON.stringify({employee_no:next}),reason],client);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'社員番号変更','employee',$2,$2,'success',$3,$4)`,[actorUserId,employeeId,requestId,employee.employee_no+' → '+next],client);
    return updated
  })
}
async function transitionEmployee({employeeId,target,reason,handoffNote,actorUserId,expectedVersion,requestId}){
  return withTransaction(async client=>{
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
    await query(`insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason) values('employee',$1,$1,$2,'employee_transition',$3::jsonb,$4::jsonb,$5)`,[employeeId,actorUserId,JSON.stringify({office:before.office,department:before.department,lifecycle_status:before.lifecycle_status,retired_on:before.retired_on}),JSON.stringify(next),reason||handoffNote||''],client);
    if(next.lifecycle_status==='retired'){
      const users=await query(`update users set state='suspended',updated_at=now(),version=version+1 where employee_id=$1 returning id`,[employeeId],client);
      for(const u of users.rows)await query(`update auth_sessions set revoked_at=now(),revoke_reason='employee_retired' where user_id=$1 and revoked_at is null`,[u.id],client)
    }
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'社員状態変更','employee',$2,$2,'success',$3,$4)`,[actorUserId,employeeId,requestId,before.lifecycle_status+' → '+next.lifecycle_status],client);
    return updated
  })
}
module.exports={listEmployeesForUser,getEmployeeForUser,changeEmployeeNumber,transitionEmployee,scopeSql};
