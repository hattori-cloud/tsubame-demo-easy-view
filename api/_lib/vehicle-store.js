const {query,withTransaction}=require('./db');
const {scopeSql}=require('./employee-store');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function requireVehicleManager(user){if(!user||!['full','scoped'].includes(user.role_level))throw problem(403,'MANAGER_REQUIRED','車両管理は管理者のみ実行できます');return user}
function assertVersion(row,expected){if(Number(row.version)!==Number(expected))throw problem(409,'VERSION_CONFLICT','別の利用者が先に更新しています。最新データを読み直してください')}
async function visibleEmployee(user,employeeId,client){
  if(!employeeId)return null;
  const params=[employeeId],scope=scopeSql(user,params,'e');
  const r=await query(`select e.* from employees e where e.id=$1 and ${scope} limit 1`,params,client);
  if(!r.rows[0])throw problem(404,'NOT_FOUND','対象社員が見つかりません');
  return r.rows[0]
}
function vehicleScopeSql(user,params,alias='v'){
  if(user.role_level==='full')return 'true';
  if(user.role_level==='self'){params.push(user.employee_id);const p=params.length;return `(${alias}.primary_employee_id=$${p} or exists(select 1 from vehicle_users vu where vu.vehicle_id=${alias}.id and vu.employee_id=$${p} and vu.ended_on is null))`}
  if(user.role_level==='scoped'){
    const scope=scopeSql(user,params,'se');
    return `exists(select 1 from employees se where (${alias}.primary_employee_id=se.id or exists(select 1 from vehicle_users vu where vu.vehicle_id=${alias}.id and vu.employee_id=se.id and vu.ended_on is null)) and ${scope})`
  }
  return 'false'
}
async function listVehicles(user,filters={}){
  requireVehicleManager(user);
  const params=[];
  const vehicleScope=vehicleScopeSql(user,params,'v');
  const primaryScope=scopeSql(user,params,'e');
  const assignedScope=scopeSql(user,params,'eu');
  const searchPrimaryScope=scopeSql(user,params,'e2');
  const searchAssignedScope=scopeSql(user,params,'e3');
  const where=[vehicleScope,'v.archived_at is null'];
  const q=String(filters.q||'').trim(),status=String(filters.status||'').trim(),mode=String(filters.assignment_mode||'').trim();
  if(status){params.push(status);where.push(`v.status=$${params.length}`)}
  if(mode){params.push(mode);where.push(`v.assignment_mode=$${params.length}`)}
  if(q){params.push('%'+q+'%');const p=params.length;where.push(`(v.car_no ilike $${p} or coalesce(v.model,'') ilike $${p} or coalesce(v.service,'') ilike $${p} or exists(select 1 from employees e2 where e2.id=v.primary_employee_id and (${searchPrimaryScope}) and (e2.name ilike $${p} or e2.employee_no ilike $${p})) or exists(select 1 from vehicle_users vu2 join employees e3 on e3.id=vu2.employee_id and (${searchAssignedScope}) where vu2.vehicle_id=v.id and vu2.ended_on is null and (e3.name ilike $${p} or e3.employee_no ilike $${p})))`)}
  const page=Math.max(1,Number.parseInt(filters.page,10)||1),pageSize=Math.min(100,Math.max(1,Number.parseInt(filters.page_size,10)||50)),offset=(page-1)*pageSize;
  params.push(pageSize,offset);
  const r=await query(`
    select v.id,v.car_no,v.model,v.service,v.status,v.assignment_mode,
           case when e.id is null then null else v.primary_employee_id end as primary_employee_id,
           v.inspection_due,v.next_maintenance_due,v.maintenance_note,v.archived_at,v.created_at,v.updated_at,v.version,
           e.employee_no as primary_employee_no,e.name as primary_employee_name,
           coalesce((select jsonb_agg(jsonb_build_object('employee_id',vu.employee_id,'employee_no',eu.employee_no,'name',eu.name,'role',vu.role) order by vu.role,eu.employee_no) from vehicle_users vu join employees eu on eu.id=vu.employee_id and (${assignedScope}) where vu.vehicle_id=v.id and vu.ended_on is null),'[]'::jsonb) as users,
           count(*) over()::int as _total
      from vehicles v left join employees e on e.id=v.primary_employee_id and (${primaryScope})
     where ${where.join(' and ')}
  order by v.car_no,v.id limit $${params.length-1} offset $${params.length}
  `,params);
  const total=r.rows[0]?Number(r.rows[0]._total):0;return {items:r.rows.map(({_total,...x})=>x),page,page_size:pageSize,total}
}
async function getVehicle(user,id,client=null,{forUpdate=false}={}){
  requireVehicleManager(user);
  const params=[id],scope=vehicleScopeSql(user,params,'v'),primaryScope=scopeSql(user,params,'e');
  const lock=forUpdate?' for update of v':'';
  const r=await query(`
    select v.id,v.car_no,v.model,v.service,v.status,v.assignment_mode,
           case when e.id is null then null else v.primary_employee_id end as primary_employee_id,
           v.inspection_due,v.next_maintenance_due,v.maintenance_note,v.archived_at,v.created_at,v.updated_at,v.version
      from vehicles v
 left join employees e on e.id=v.primary_employee_id and (${primaryScope})
     where v.id=$1 and v.archived_at is null and ${scope}${lock}
  `,params,client);
  if(!r.rows[0])throw problem(404,'NOT_FOUND','対象車両が見つかりません');
  return r.rows[0]
}
async function createVehicle({user,body,requestId}){
  requireVehicleManager(user);
  return withTransaction(async client=>{
    const car=String(body.car_no||'').trim();if(!/^[0-9]{3}$/.test(car))throw problem(422,'INVALID_CAR_NO','号車は3桁で入力してください');
    const mode=String(body.assignment_mode||'dedicated');if(!['dedicated','shared','spare','loaner'].includes(mode))throw problem(422,'INVALID_ASSIGNMENT_MODE','車両区分を確認してください');
    const primary=body.primary_employee_id?await visibleEmployee(user,String(body.primary_employee_id),client):null;
    if(mode==='dedicated'&&!primary)throw problem(422,'PRIMARY_EMPLOYEE_REQUIRED','専属車には主担当乗務員が必要です');
    const inspection=String(body.inspection_due||'').trim();if(!inspection)throw problem(422,'INSPECTION_DUE_REQUIRED','車検期限を入力してください');
    const row=(await query(`insert into vehicles(car_no,model,service,status,assignment_mode,primary_employee_id,inspection_due,next_maintenance_due,maintenance_note) values($1,$2,$3,$4,$5,$6,$7,$8,$9) returning *`,[car,body.model||null,body.service||null,body.status||'active',mode,primary?.id||null,inspection,body.next_maintenance_due||null,body.maintenance_note||null],client)).rows[0];
    if(primary)await query(`insert into vehicle_users(vehicle_id,employee_id,role) values($1,$2,'primary')`,[row.id,primary.id],client);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'車両登録','vehicle',$2,$3,'success',$4,$5)`,[user.id,row.id,primary?.id||null,requestId,car+' / '+mode],client);
    return row
  })
}
async function updateVehicle({user,id,body,expectedVersion,requestId}){
  requireVehicleManager(user);
  return withTransaction(async client=>{
    const before=await getVehicle(user,id,client,{forUpdate:true});assertVersion(before,expectedVersion);
    if(Object.prototype.hasOwnProperty.call(body||{},'primary_employee_id')||Object.prototype.hasOwnProperty.call(body||{},'additional_employee_ids'))throw problem(422,'USE_ASSIGNMENTS_ENDPOINT','乗務員割当は専用操作を使用してください');
    const allowed=['model','service','status','assignment_mode','inspection_due','next_maintenance_due','maintenance_note'];
    const patch={};for(const k of allowed)if(Object.prototype.hasOwnProperty.call(body||{},k))patch[k]=body[k]===undefined?null:body[k];
    const changed=Object.entries(patch).filter(([k,v])=>String(before[k]??'')!==String(v??''));if(!changed.length)return before;
    if('assignment_mode' in patch&&!['dedicated','shared','spare','loaner'].includes(String(patch.assignment_mode)))throw problem(422,'INVALID_ASSIGNMENT_MODE','車両区分を確認してください');
    const params=[id],sets=changed.map(([k,v])=>{params.push(v);return `${k}=$${params.length}`});
    const after=(await query(`update vehicles set ${sets.join(',')},updated_at=now(),version=version+1 where id=$1 returning *`,params,client)).rows[0];
    await query(`insert into record_histories(entity_type,entity_id,actor_user_id,action,before_data,after_data,reason) values('vehicle',$1,$2,'update',$3::jsonb,$4::jsonb,'車両情報更新')`,[id,user.id,JSON.stringify(Object.fromEntries(changed.map(([k])=>[k,before[k]]))),JSON.stringify(Object.fromEntries(changed))],client);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,result,request_id,summary) values($1,'車両更新','vehicle',$2,'success',$3,$4)`,[user.id,id,requestId,changed.map(([k])=>k).join(',')],client);
    return after
  })
}
async function updateVehicleAssignments({user,id,body,expectedVersion,requestId}){
  requireVehicleManager(user);
  return withTransaction(async client=>{
    const before=await getVehicle(user,id,client,{forUpdate:true});assertVersion(before,expectedVersion);
    const primaryId=body.primary_employee_id?String(body.primary_employee_id):null;
    const additional=[...new Set((Array.isArray(body.additional_employee_ids)?body.additional_employee_ids:[]).map(String).filter(Boolean).filter(x=>x!==primaryId))];
    const primary=primaryId?await visibleEmployee(user,primaryId,client):null;
    const extra=[];for(const eid of additional)extra.push(await visibleEmployee(user,eid,client));
    const mode=String(body.assignment_mode||before.assignment_mode);
    if(mode==='dedicated'&&!primary)throw problem(422,'PRIMARY_EMPLOYEE_REQUIRED','専属車には主担当乗務員が必要です');
    const beforeUsers=(await query(`select employee_id,role from vehicle_users where vehicle_id=$1 and ended_on is null order by role,employee_id`,[id],client)).rows;
    const desiredUsers=[...(primary?[{employee_id:primary.id,role:'primary'}]:[]),...extra.map(e=>({employee_id:e.id,role:'additional'}))];
    const beforeKeys=new Set(beforeUsers.map(x=>String(x.employee_id)+'|'+String(x.role)));
    const desiredKeys=new Set(desiredUsers.map(x=>String(x.employee_id)+'|'+String(x.role)));
    for(const old of beforeUsers){
      const key=String(old.employee_id)+'|'+String(old.role);
      if(!desiredKeys.has(key))await query(`update vehicle_users set ended_on=current_date where vehicle_id=$1 and employee_id=$2 and role=$3 and ended_on is null`,[id,old.employee_id,old.role],client)
    }
    for(const next of desiredUsers){
      const key=String(next.employee_id)+'|'+String(next.role);
      if(!beforeKeys.has(key))await query(`insert into vehicle_users(vehicle_id,employee_id,role) values($1,$2,$3)`,[id,next.employee_id,next.role],client)
    }
    const after=(await query(`update vehicles set primary_employee_id=$2,assignment_mode=$3,updated_at=now(),version=version+1 where id=$1 returning *`,[id,primary?.id||null,mode],client)).rows[0];
    const afterUsers=desiredUsers;
    await query(`insert into record_histories(entity_type,entity_id,actor_user_id,action,before_data,after_data,reason) values('vehicle',$1,$2,'assignments_change',$3::jsonb,$4::jsonb,'車両担当変更')`,[id,user.id,JSON.stringify({assignment_mode:before.assignment_mode,primary_employee_id:before.primary_employee_id,users:beforeUsers}),JSON.stringify({assignment_mode:mode,primary_employee_id:primary?.id||null,users:afterUsers})],client);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'車両担当変更','vehicle',$2,$3,'success',$4,$5)`,[user.id,id,primary?.id||null,requestId,'主担当 '+(primary?.employee_no||'なし')+' / 追加 '+extra.length+'名'],client);
    return after
  })
}
module.exports={listVehicles,getVehicle,createVehicle,updateVehicle,updateVehicleAssignments,vehicleScopeSql,requireVehicleManager};
