'use strict';

process.env.TSUBAME_DB_SSL=process.env.TSUBAME_DB_SSL||'disable';

const {query,closePool}=require('../api/_lib/db');

const CONFIG={
  startYear:2027,
  years:5,
  initialEmployees:310,
  annualHires:50,
  annualRetirements:30,
  monthlyNearMisses:400,
  monthlyAccidents:20,
  monthlyComplaints:20,
  annualRenumbers:12,
  annualTransfers:10,
  designatedUsers:30
};

function assert(cond,message){if(!cond)throw new Error(message)}
function pad(n,len=4){return String(n).padStart(len,'0')}
function monthParts(monthIndex){
  return {year:CONFIG.startYear+Math.floor(monthIndex/12),month:(monthIndex%12)+1}
}
function isoDate(year,month,day){return [year,pad(month,2),pad(day,2)].join('-')}
function assignment(i){
  const n=((i-1)%100)+1;
  if(n<=30)return {office:'本社',department:'タクシー1課',employment_type:'乗務員'};
  if(n<=60)return {office:'府中',department:'タクシー2課',employment_type:'乗務員'};
  if(n<=64)return {office:'馬木',department:'バス課',employment_type:'乗務員'};
  if(n<=82)return {office:'本社',department:'総務課',employment_type:'事務'};
  return {office:'府中',department:'運行管理課',employment_type:'事務'}
}
function movedAssignment(current){
  if(current.office==='本社'&&current.department==='タクシー1課')return {office:'府中',department:'タクシー2課'};
  if(current.office==='府中'&&current.department==='タクシー2課')return {office:'本社',department:'タクシー1課'};
  if(current.office==='馬木')return {office:'本社',department:'バス課'};
  return current.office==='本社'?{office:'府中',department:'運行管理課'}:{office:'本社',department:'総務課'}
}
function featurePreset(kind){
  if(kind==='viewer')return [
    ['employees','view'],['deadlines','view'],['accidents','view'],['complaints','view'],['near_misses','view'],
    ['credentials_documents','view'],['vehicles','view'],['safety_analysis','view']
  ];
  if(kind==='safety')return [
    ['employees','view'],['deadlines','view'],['accidents','edit'],['complaints','edit'],['near_misses','edit'],
    ['credentials_documents','view'],['vehicles','view'],['safety_analysis','view']
  ];
  return [
    ['employees','edit'],['deadlines','view'],['accidents','edit'],['complaints','edit'],['near_misses','edit'],
    ['credentials_documents','edit'],['vehicles','view'],['safety_analysis','view'],['notices_workflow','view']
  ]
}
async function batchInsert(table,columns,rows,chunkSize=500){
  for(let offset=0;offset<rows.length;offset+=chunkSize){
    const chunk=rows.slice(offset,offset+chunkSize),params=[];
    const values=chunk.map(row=>'('+columns.map(col=>'$'+(params.push(row[col]),params.length)).join(',')+')');
    await query('insert into '+table+'('+columns.join(',')+') values '+values.join(','),params)
  }
}
async function timed(name,fn,performance){
  const start=process.hrtime.bigint();
  const result=await fn();
  const ms=Number(process.hrtime.bigint()-start)/1e6;
  performance[name]=Number(ms.toFixed(2));
  return result
}
async function createEmployees(start,count,hiredOn){
  const rows=[];
  for(let i=start;i<start+count;i++){
    const a=assignment(i);
    rows.push({
      employee_no:'SIM-'+pad(i,5),name:'架空社員'+pad(i,5),furigana:'カクウシャイン'+pad(i,5),
      office:a.office,department:a.department,position:i%7===0?'主任':'一般',
      employment_type:a.employment_type,lifecycle_status:'active',hired_on:hiredOn
    })
  }
  await batchInsert('employees',
    ['employee_no','name','furigana','office','department','position','employment_type','lifecycle_status','hired_on'],rows,250);
  const from='SIM-'+pad(start,5),to='SIM-'+pad(start+count-1,5);
  const r=await query('select id,employee_no,name,office,department,employment_type,lifecycle_status from employees where employee_no between $1 and $2 order by employee_no',[from,to]);
  return r.rows
}
async function createQualifications(employees,year){
  const rows=employees.map((e,i)=>({
    employee_id:e.id,name:i%3===0?'普通二種免許':'定期資格確認',
    certificate_no:'SIM-CERT-'+e.employee_no,
    expiry:isoDate(year+1+(i%3),((i%12)+1),Math.min(28,(i%27)+1)),
    status:'active',evidence_requirement:i%2===0?'required':'not_required'
  }));
  await batchInsert('qualifications',['employee_id','name','certificate_no','expiry','status','evidence_requirement'],rows,300)
}
async function createDesignatedUsers(employees){
  const selected=employees.slice(0,CONFIG.designatedUsers);
  for(let i=0;i<selected.length;i++){
    const e=selected[i],full=i<3,role=full?'full':'scoped';
    const u=(await query(`
      insert into users(employee_id,login_id,password_hash,display_name,role_level,safety_authority,state,mfa_required,mfa_enrolled_at)
      values($1,$2,$3,$4,$5,$6,'active',true,now())
      returning id
    `,[e.id,'SIM-USER-'+pad(i+1,3),'SIMULATED_HASH_NOT_FOR_LOGIN',e.name,role,i%5===0])).rows[0];
    if(!full){
      await query('insert into user_scopes(user_id,office,department) values($1,$2,$3)',[u.id,e.office,e.department]);
      const preset=featurePreset(i%3===0?'viewer':i%3===1?'safety':'manager');
      for(const [feature,access] of preset)await query('insert into user_feature_permissions(user_id,feature,access_level) values($1,$2,$3)',[u.id,feature,access])
    }
  }
  return (await query("select id,employee_id,role_level,state from users order by created_at,id")).rows
}
async function activeEmployees(){
  return (await query("select id,employee_no,name,office,department,employment_type from employees where lifecycle_status='active' order by employee_no")).rows
}
async function generateMonth(monthIndex,active){
  const {year,month}=monthParts(monthIndex),yyyymm=String(year)+pad(month,2);
  const near=[];
  for(let i=0;i<CONFIG.monthlyNearMisses;i++){
    const e=active[(monthIndex*17+i*13)%active.length],day=(i%28)+1;
    near.push({
      report_no:'SIM-NM-'+yyyymm+'-'+pad(i+1,4),employee_id:e.id,
      occurred_on:isoDate(year,month,day),reported_on:isoDate(year,month,day),
      car_no:pad(((i+monthIndex)%999)+1,3),summary:'架空ヒヤリ運用データ '+yyyymm+'-'+pad(i+1,4),
      prevention:'架空再発防止',risk_level:i%20===0?'high':i%4===0?'medium':'low',
      employee_no_at_report:e.employee_no,office_at_report:e.office,department_at_report:e.department,
      employment_at_report:e.employment_type
    })
  }
  await batchInsert('near_misses',[
    'report_no','employee_id','occurred_on','reported_on','car_no','summary','prevention','risk_level',
    'employee_no_at_report','office_at_report','department_at_report','employment_at_report'
  ],near,500);

  const accidents=[];
  for(let i=0;i<CONFIG.monthlyAccidents;i++){
    const e=active[(monthIndex*11+i*29)%active.length],day=(i%28)+1;
    accidents.push({
      accident_no:'SIM-AC-'+yyyymm+'-'+pad(i+1,3),employee_id:e.id,office_at_record:e.office,
      department_at_record:e.department,employment_at_record:e.employment_type,occurred_on:isoDate(year,month,day),
      car_no:pad(((i*7+monthIndex)%999)+1,3),address:'架空地点 '+pad(i+1,3),summary:'架空事故 '+yyyymm,
      phase:i%3===0?'completed':'investigating',cause:'架空原因',prevention:'架空再発防止',response_history:'架空対応履歴'
    })
  }
  await batchInsert('accidents',[
    'accident_no','employee_id','office_at_record','department_at_record','employment_at_record','occurred_on',
    'car_no','address','summary','phase','cause','prevention','response_history'
  ],accidents,200);

  const complaints=[];
  for(let i=0;i<CONFIG.monthlyComplaints;i++){
    const e=active[(monthIndex*7+i*31)%active.length],day=(i%28)+1;
    complaints.push({
      complaint_no:'SIM-CP-'+yyyymm+'-'+pad(i+1,3),employee_id:e.id,office_at_record:e.office,
      department_at_record:e.department,employment_at_record:e.employment_type,responded_on:isoDate(year,month,day),
      summary:'架空苦情 '+yyyymm,rank:['A','B','C'][i%3],guidance_content:'架空指導内容',
      next_action:'架空次回対応',status:i%4===0?'completed':'open'
    })
  }
  await batchInsert('complaints',[
    'complaint_no','employee_id','office_at_record','department_at_record','employment_at_record','responded_on',
    'summary','rank','guidance_content','next_action','status'
  ],complaints,200)
}
async function yearEnd(year,employeeSequence,adminUserId){
  let active=await activeEmployees();
  const retirees=active.slice(-CONFIG.annualRetirements);
  for(const e of retirees){
    await query("update employees set lifecycle_status='retired',retired_on=$2,updated_at=now(),version=version+1 where id=$1",[e.id,isoDate(year,12,31)]);
    await query(`insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason)
      values('employee',$1,$1,$2,'simulation_retirement',$3::jsonb,$4::jsonb,'5-year fictional simulation')`,
      [e.id,adminUserId,JSON.stringify({lifecycle_status:'active'}),JSON.stringify({lifecycle_status:'retired',retired_on:isoDate(year,12,31)})])
  }

  active=await activeEmployees();
  const renumbers=active.slice(0,CONFIG.annualRenumbers);
  for(let i=0;i<renumbers.length;i++){
    const e=renumbers[i],next=e.employee_no+'R'+String(year).slice(-2);
    await query('insert into employee_number_history(employee_id,old_employee_no,new_employee_no,reason,changed_by_user_id) values($1,$2,$3,$4,$5)',
      [e.id,e.employee_no,next,'5-year fictional simulation',adminUserId]);
    await query('update employees set employee_no=$2,updated_at=now(),version=version+1 where id=$1',[e.id,next])
  }

  active=await activeEmployees();
  const transfers=active.slice(CONFIG.annualRenumbers,CONFIG.annualRenumbers+CONFIG.annualTransfers);
  for(const e of transfers){
    const next=movedAssignment(e);
    await query('update employees set office=$2,department=$3,updated_at=now(),version=version+1 where id=$1',[e.id,next.office,next.department]);
    await query(`insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason)
      values('employee',$1,$1,$2,'simulation_transfer',$3::jsonb,$4::jsonb,'5-year fictional simulation')`,
      [e.id,adminUserId,JSON.stringify({office:e.office,department:e.department}),JSON.stringify(next)])
  }

  const hires=await createEmployees(employeeSequence.value,CONFIG.annualHires,isoDate(year,12,31));
  employeeSequence.value+=CONFIG.annualHires;
  await createQualifications(hires,year);

  const scoped=(await query("select id from users where role_level='scoped' and state='active' order by id limit 5")).rows;
  for(let i=0;i<scoped.length;i++){
    const u=scoped[i];
    await query(`
      insert into user_feature_permissions(user_id,feature,access_level)
      values($1,'deadlines',$2)
      on conflict(user_id,feature) do update set access_level=excluded.access_level
    `,[u.id,(year+i)%2===0?'edit':'view']);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,result,request_id,summary)
      values($1,'simulation_permission_change','user',$2,'success','sim5','fictional permission lifecycle')`,
      [adminUserId,u.id])
  }
}
async function addEventAuditRows(adminUserId){
  await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary)
    select $1,'simulation_near_miss_recorded','near_miss',id::text,employee_id,'success','sim5','fictional five-year record' from near_misses where report_no like 'SIM-NM-%'`,[adminUserId]);
  await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary)
    select $1,'simulation_accident_recorded','accident',id::text,employee_id,'success','sim5','fictional five-year record' from accidents where accident_no like 'SIM-AC-%'`,[adminUserId]);
  await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary)
    select $1,'simulation_complaint_recorded','complaint',id::text,employee_id,'success','sim5','fictional five-year record' from complaints where complaint_no like 'SIM-CP-%'`,[adminUserId])
}
async function verify(performance){
  const counts={};
  for(const table of ['employees','near_misses','accidents','complaints','employee_number_history','audit_logs','record_histories','users','user_feature_permissions']){
    counts[table]=Number((await query('select count(*)::int as n from '+table)).rows[0].n)
  }
  const active=Number((await query("select count(*)::int as n from employees where lifecycle_status='active'")).rows[0].n);
  const retired=Number((await query("select count(*)::int as n from employees where lifecycle_status='retired'")).rows[0].n);
  const selfUsers=Number((await query("select count(*)::int as n from users where role_level='self'")).rows[0].n);
  const badSnapshots=Number((await query(`
    select
      (select count(*) from near_misses where office_at_report is null or department_at_report is null or employee_no_at_report is null)+
      (select count(*) from accidents where office_at_record is null or department_at_record is null)+
      (select count(*) from complaints where office_at_record is null or department_at_record is null) as n
  `)).rows[0].n);
  const duplicateCurrent=Number((await query('select count(*)::int as n from (select employee_no from employees group by employee_no having count(*)>1) x')).rows[0].n);
  const historicalSnapshotRetained=Number((await query(`
    select count(*)::int as n
      from accidents a join employees e on e.id=a.employee_id
     where a.office_at_record is distinct from e.office or a.department_at_record is distinct from e.department
  `)).rows[0].n);

  await timed('employee_number_lookup',()=>query("select id from employees where employee_no=$1",['SIM-00001R27R28R29R30R31']),performance);
  await timed('latest_near_misses',()=>query("select id,reported_on from near_misses where archived_at is null order by reported_on desc,id limit 100"),performance);
  await timed('monthly_safety_aggregate',()=>query(`
    select date_trunc('month',reported_on)::date as month,count(*)::int
      from near_misses
     where reported_on between $1 and $2
     group by 1 order by 1
  `,[isoDate(CONFIG.startYear,1,1),isoDate(CONFIG.startYear+CONFIG.years-1,12,31)]),performance);
  await timed('scope_filtered_accidents',()=>query(`
    select count(*)::int
      from accidents
     where office_at_record='本社' and department_at_record='タクシー1課'
  `),performance);

  const expected={
    employees:CONFIG.initialEmployees+CONFIG.annualHires*CONFIG.years,
    active:CONFIG.initialEmployees+(CONFIG.annualHires-CONFIG.annualRetirements)*CONFIG.years,
    retired:CONFIG.annualRetirements*CONFIG.years,
    near_misses:CONFIG.monthlyNearMisses*12*CONFIG.years,
    accidents:CONFIG.monthlyAccidents*12*CONFIG.years,
    complaints:CONFIG.monthlyComplaints*12*CONFIG.years,
    employee_number_history:CONFIG.annualRenumbers*CONFIG.years
  };
  const invariants={
    employee_total:counts.employees===expected.employees,
    active_employee_count:active===expected.active,
    retired_employee_count:retired===expected.retired,
    near_miss_volume:counts.near_misses===expected.near_misses,
    accident_volume:counts.accidents===expected.accidents,
    complaint_volume:counts.complaints===expected.complaints,
    renumber_history:counts.employee_number_history===expected.employee_number_history,
    no_self_users:selfUsers===0,
    no_missing_snapshots:badSnapshots===0,
    no_duplicate_current_employee_numbers:duplicateCurrent===0,
    historical_snapshot_survives_transfer:historicalSnapshotRetained>0,
    permission_rows_present:counts.user_feature_permissions>0,
    audit_rows_present:counts.audit_logs>=counts.near_misses+counts.accidents+counts.complaints,
    representative_queries_under_5s:Object.values(performance).every(ms=>ms<5000)
  };
  return {counts,expected,active,retired,historical_snapshot_mismatch_rows:historicalSnapshotRetained,invariants}
}
async function main(){
  if(String(process.env.VERCEL_ENV||'').toLowerCase()==='production')throw new Error('five-year simulation is forbidden in production');
  if(process.env.TSUBAME_FIVE_YEAR_SIMULATION!=='1')throw new Error('set TSUBAME_FIVE_YEAR_SIMULATION=1 only on a dedicated fictional test database');
  const existing=Number((await query('select count(*)::int as n from employees')).rows[0].n);
  assert(existing===0,'five-year simulation requires an empty dedicated database');

  const performance={};
  const initial=await createEmployees(1,CONFIG.initialEmployees,isoDate(CONFIG.startYear-1,12,1));
  await createQualifications(initial,CONFIG.startYear-1);
  const users=await createDesignatedUsers(initial);
  const adminUserId=users.find(u=>u.role_level==='full')?.id;
  assert(adminUserId,'simulation full administrator missing');

  const seq={value:CONFIG.initialEmployees+1};
  for(let monthIndex=0;monthIndex<CONFIG.years*12;monthIndex++){
    const active=await activeEmployees();
    await generateMonth(monthIndex,active);
    if(monthIndex%12===11)await yearEnd(monthParts(monthIndex).year,seq,adminUserId)
  }
  await addEventAuditRows(adminUserId);
  const verified=await verify(performance);
  const ok=Object.values(verified.invariants).every(Boolean);
  const report={
    ok,fictional_only:true,production_forbidden:true,years:CONFIG.years,
    period:CONFIG.startYear+'-01-01 to '+(CONFIG.startYear+CONFIG.years-1)+'-12-31',
    config:CONFIG,...verified,performance_ms:performance
  };
  console.log(JSON.stringify(report,null,2));
  if(!ok)process.exitCode=2
}
main().catch(err=>{
  console.error(JSON.stringify({ok:false,error:'FIVE_YEAR_SIMULATION_FAILED',message:err.message,fictional_only:true}));
  process.exitCode=1
}).finally(async()=>{await closePool()});
