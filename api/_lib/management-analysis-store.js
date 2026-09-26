'use strict';

const {query}=require('./db');
const {scopeSql}=require('./employee-store');
const {hasFeaturePermission}=require('./authorization');
const {vehicleScopeSql}=require('./vehicle-store');
const {safetySummary}=require('./safety-analysis-store');

function currentWhere(user,filters={},alias='e'){
  const params=[],where=[scopeSql(user,params,alias),alias+'.archived_at is null'];
  if(filters.office){params.push(String(filters.office));where.push(alias+'.office=$'+params.length)}
  if(filters.department){params.push(String(filters.department));where.push(alias+'.department=$'+params.length)}
  return {params,where}
}
function safetyWindow(params,filters,dateExpr){
  params.push(filters.from?String(filters.from):null,filters.to?String(filters.to):null);
  const from=params.length-1,to=params.length;
  return `${dateExpr}>=coalesce($${from}::date,date_trunc('month',current_date)::date-interval '11 months') and ${dateExpr}<=coalesce($${to}::date,current_date)`
}
async function workforceSummary(user,filters){
  const {params,where}=currentWhere(user,filters);
  const r=await query(`
    select count(*)::int total,
           count(*) filter(where lifecycle_status='active')::int active,
           count(*) filter(where lifecycle_status='leave')::int leave_count,
           count(*) filter(where lifecycle_status='retirement_planned')::int retirement_planned,
           count(*) filter(where lifecycle_status='retired')::int retired,
           count(*) filter(where hired_on>=current_date-interval '12 months')::int hired_last_12m,
           count(*) filter(where retired_on>=current_date-interval '12 months')::int retired_last_12m,
           count(*) filter(where hired_on is null and lifecycle_status<>'retired')::int hired_on_missing
      from employees e where ${where.join(' and ')}
  `,params);
  return r.rows[0]||{}
}
async function coreDeadlineSummary(user,filters){
  const {params,where}=currentWhere(user,filters);
  const any60=`((e.license_expiry is not null and e.license_expiry<=current_date+60) or (e.health_check_due is not null and e.health_check_due<=current_date+60) or (e.aptitude_due is not null and e.aptitude_due<=current_date+60))`;
  const overdue=`((e.license_expiry is not null and e.license_expiry<current_date) or (e.health_check_due is not null and e.health_check_due<current_date) or (e.aptitude_due is not null and e.aptitude_due<current_date))`;
  const r=await query(`
    select count(*) filter(where e.lifecycle_status<>'retired' and ${any60})::int employees_due_60,
           count(*) filter(where e.lifecycle_status<>'retired' and ${overdue})::int employees_overdue,
           count(*) filter(where e.lifecycle_status<>'retired' and e.license_expiry<current_date)::int license_overdue,
           count(*) filter(where e.lifecycle_status<>'retired' and e.health_check_due<current_date)::int health_overdue,
           count(*) filter(where e.lifecycle_status<>'retired' and e.aptitude_due<current_date)::int aptitude_overdue
      from employees e where ${where.join(' and ')}
  `,params);
  return r.rows[0]||{}
}
async function credentialSummary(user,filters){
  const base=currentWhere(user,filters),p=base.params,w=base.where;
  const q=await query(`
    select count(*) filter(where q.expiry is not null and q.expiry<=current_date+60)::int qualifications_due_60,
           count(*) filter(where q.expiry is not null and q.expiry<current_date)::int qualifications_overdue
      from qualifications q join employees e on e.id=q.employee_id
     where q.archived_at is null and ${w.join(' and ')}
  `,p);
  const docBase=currentWhere(user,filters),dp=docBase.params,dw=docBase.where;
  if(user.role_level!=='full')dw.push("d.security_class<>'strict' and d.access_level in ('self_allowed','scope_admin')");
  const d=await query(`
    select count(*) filter(where d.status in ('pending','replacement_due','invalid') or d.storage_state in ('quarantine','blocked') or (d.verification_required=true and d.verified_by_user_id is null))::int documents_attention,
           count(*) filter(where d.storage_state in ('quarantine','blocked'))::int documents_storage_attention,
           count(*) filter(where d.verification_required=true and d.verified_by_user_id is null)::int documents_unverified
      from documents d join employees e on e.id=d.employee_id
     where d.archived_at is null and ${dw.join(' and ')}
  `,dp);
  return {...(q.rows[0]||{}),...(d.rows[0]||{})}
}
async function supportSummary(user,filters){
  const t=currentWhere(user,filters),a=currentWhere(user,filters);
  const training=await query(`
    select count(*) filter(where t.status<>'completed')::int training_open,
           count(*) filter(where t.status<>'completed' and t.due is not null and t.due<current_date)::int training_overdue,
           count(*) filter(where t.status<>'completed' and t.due is not null and t.due<=current_date+60)::int training_due_60
      from safety_training t join employees e on e.id=t.employee_id
     where ${t.where.join(' and ')}
  `,t.params);
  const assets=await query(`
    select count(*) filter(where a.status<>'returned')::int assets_loaned,
           count(*) filter(where a.status<>'returned' and a.return_due is not null and a.return_due<current_date)::int assets_overdue
      from assets a join employees e on e.id=a.employee_id
     where ${a.where.join(' and ')}
  `,a.params);
  return {...(training.rows[0]||{}),...(assets.rows[0]||{})}
}
async function workSummary(user,filters){
  const {params,where}=currentWhere(user,filters);
  const r=await query(`
    with scoped as (
      select w.*,e.office,e.department
        from work_summary_monthly w join employees e on e.id=w.employee_id
       where ${where.join(' and ')}
    ), latest as (select max(month_start) month_start from scoped)
    select latest.month_start,
           count(scoped.id)::int employee_count,
           count(scoped.id) filter(where scoped.overtime_hours>=60)::int overtime_60_count,
           coalesce(avg(scoped.overtime_hours),0)::numeric(10,1) average_overtime_hours
      from latest left join scoped on scoped.month_start=latest.month_start
     group by latest.month_start
  `,params);
  return r.rows[0]||{}
}
async function vehicleSummary(user,filters){
  const params=[],where=[vehicleScopeSql(user,params,'v'),'v.archived_at is null'];
  const employeeFilters=[];
  if(filters.office){params.push(String(filters.office));employeeFilters.push('ve.office=
  const {params,where}=currentWhere(user,filters);
  const actionExpr=deadlines
    ?`count(*) filter(where e.lifecycle_status<>'retired' and ((e.license_expiry is not null and e.license_expiry<=current_date+60) or (e.health_check_due is not null and e.health_check_due<=current_date+60) or (e.aptitude_due is not null and e.aptitude_due<=current_date+60)))::int`
    :'null::int';
  const r=await query(`
    select e.office,e.department,
           count(*)::int total,
           count(*) filter(where e.lifecycle_status='active')::int active,
           count(*) filter(where e.lifecycle_status='leave')::int leave_count,
           count(*) filter(where e.lifecycle_status='retirement_planned')::int retirement_planned,
           ${actionExpr} as deadline_action_employees
      from employees e where ${where.join(' and ')}
     group by e.office,e.department
     order by e.office,e.department
  `,params);
  return r.rows
}
async function crossSignals(user,filters,{deadlines=false,assets=false}={}){
  const {params,where}=currentWhere(user,filters);
  const period=safetyWindow(params,filters,'x.event_date');
  const safetyExists=`exists(
    select 1 from (
      select a.employee_id,a.occurred_on event_date from accidents a where a.archived_at is null
      union all select n.employee_id,n.occurred_on from near_misses n where n.archived_at is null
      union all select c.employee_id,coalesce(c.occurrence_date,c.responded_on) from complaints c where c.archived_at is null
    ) x where x.employee_id=e.id and ${period}
  )`;
  const deadlineExpr=deadlines
    ?`count(*) filter(where e.lifecycle_status='active' and ${safetyExists} and ((e.license_expiry is not null and e.license_expiry<=current_date+60) or (e.health_check_due is not null and e.health_check_due<=current_date+60) or (e.aptitude_due is not null and e.aptitude_due<=current_date+60)))::int`
    :'null::int';
  const assetExpr=assets
    ?`count(*) filter(where e.lifecycle_status='retirement_planned' and exists(select 1 from assets a where a.employee_id=e.id and a.status<>'returned'))::int`
    :'null::int';
  const r=await query(`
    select count(*) filter(where e.lifecycle_status='active' and e.hired_on>=current_date-interval '12 months' and ${safetyExists})::int new_hire_with_safety,
           ${deadlineExpr} as safety_and_deadline_action,
           ${assetExpr} as retirement_planned_with_assets
      from employees e where ${where.join(' and ')}
  `,params);
  return r.rows[0]||{}
}
async function managementSummary(user,identity,filters={}){
  const safety=await safetySummary(user,filters);
  const access={
    employees:hasFeaturePermission(user,'employees','view'),
    deadlines:hasFeaturePermission(user,'deadlines','view'),
    credentials:hasFeaturePermission(user,'credentials_documents','view'),
    assets_training:hasFeaturePermission(user,'assets_training','view'),
    vehicles:hasFeaturePermission(user,'vehicles','view'),
    work_import:hasFeaturePermission(user,'work_import','view')
  };
  const [workforce,deadlines,credentials,support,vehicles,work,departments,signals]=await Promise.all([
    access.employees?workforceSummary(user,filters):Promise.resolve(null),
    access.deadlines?coreDeadlineSummary(user,filters):Promise.resolve(null),
    access.credentials?credentialSummary(user,filters):Promise.resolve(null),
    access.assets_training?supportSummary(user,filters):Promise.resolve(null),
    access.vehicles?vehicleSummary(user,filters):Promise.resolve(null),
    access.work_import?workSummary(user,filters):Promise.resolve(null),
    access.employees?departmentSummary(user,filters,{deadlines:access.deadlines}):Promise.resolve([]),
    access.employees?crossSignals(user,filters,{deadlines:access.deadlines,assets:access.assets_training}):Promise.resolve(null)
  ]);
  return {
    filters:safety.filters,
    access,
    workforce,deadlines,credentials,support,vehicles,work,signals,departments,
    safety,
    notes:{
      workforce_basis:'人員・期限・資格・教育・貸与品・勤務は現在所属で集計します。',
      safety_basis:'事故・苦情・ヒヤリの部署集計は記録時所属snapshotで集計します。',
      cross_basis:'横断確認は人数の把握用です。個人順位・危険人物判定・退職予測には使用しません。'
    }
  }
}
module.exports={managementSummary,workforceSummary,coreDeadlineSummary,credentialSummary,supportSummary,vehicleSummary,workSummary,departmentSummary,crossSignals,currentWhere};
+params.length)}
  if(filters.department){params.push(String(filters.department));employeeFilters.push('ve.department=
  const {params,where}=currentWhere(user,filters);
  const actionExpr=deadlines
    ?`count(*) filter(where e.lifecycle_status<>'retired' and ((e.license_expiry is not null and e.license_expiry<=current_date+60) or (e.health_check_due is not null and e.health_check_due<=current_date+60) or (e.aptitude_due is not null and e.aptitude_due<=current_date+60)))::int`
    :'null::int';
  const r=await query(`
    select e.office,e.department,
           count(*)::int total,
           count(*) filter(where e.lifecycle_status='active')::int active,
           count(*) filter(where e.lifecycle_status='leave')::int leave_count,
           count(*) filter(where e.lifecycle_status='retirement_planned')::int retirement_planned,
           ${actionExpr} as deadline_action_employees
      from employees e where ${where.join(' and ')}
     group by e.office,e.department
     order by e.office,e.department
  `,params);
  return r.rows
}
async function crossSignals(user,filters,{deadlines=false,assets=false}={}){
  const {params,where}=currentWhere(user,filters);
  const period=safetyWindow(params,filters,'x.event_date');
  const safetyExists=`exists(
    select 1 from (
      select a.employee_id,a.occurred_on event_date from accidents a where a.archived_at is null
      union all select n.employee_id,n.occurred_on from near_misses n where n.archived_at is null
      union all select c.employee_id,coalesce(c.occurrence_date,c.responded_on) from complaints c where c.archived_at is null
    ) x where x.employee_id=e.id and ${period}
  )`;
  const deadlineExpr=deadlines
    ?`count(*) filter(where e.lifecycle_status='active' and ${safetyExists} and ((e.license_expiry is not null and e.license_expiry<=current_date+60) or (e.health_check_due is not null and e.health_check_due<=current_date+60) or (e.aptitude_due is not null and e.aptitude_due<=current_date+60)))::int`
    :'null::int';
  const assetExpr=assets
    ?`count(*) filter(where e.lifecycle_status='retirement_planned' and exists(select 1 from assets a where a.employee_id=e.id and a.status<>'returned'))::int`
    :'null::int';
  const r=await query(`
    select count(*) filter(where e.lifecycle_status='active' and e.hired_on>=current_date-interval '12 months' and ${safetyExists})::int new_hire_with_safety,
           ${deadlineExpr} as safety_and_deadline_action,
           ${assetExpr} as retirement_planned_with_assets
      from employees e where ${where.join(' and ')}
  `,params);
  return r.rows[0]||{}
}
async function managementSummary(user,identity,filters={}){
  const safety=await safetySummary(user,filters);
  const access={
    employees:hasFeaturePermission(user,'employees','view'),
    deadlines:hasFeaturePermission(user,'deadlines','view'),
    credentials:hasFeaturePermission(user,'credentials_documents','view'),
    assets_training:hasFeaturePermission(user,'assets_training','view'),
    work_import:hasFeaturePermission(user,'work_import','view')
  };
  const [workforce,deadlines,credentials,support,work,departments,signals]=await Promise.all([
    access.employees?workforceSummary(user,filters):Promise.resolve(null),
    access.deadlines?coreDeadlineSummary(user,filters):Promise.resolve(null),
    access.credentials?credentialSummary(user,filters):Promise.resolve(null),
    access.assets_training?supportSummary(user,filters):Promise.resolve(null),
    access.work_import?workSummary(user,filters):Promise.resolve(null),
    access.employees?departmentSummary(user,filters,{deadlines:access.deadlines}):Promise.resolve([]),
    access.employees?crossSignals(user,filters,{deadlines:access.deadlines,assets:access.assets_training}):Promise.resolve(null)
  ]);
  return {
    filters:safety.filters,
    access,
    workforce,deadlines,credentials,support,work,signals,departments,
    safety,
    notes:{
      workforce_basis:'人員・期限・資格・教育・貸与品・勤務は現在所属で集計します。',
      safety_basis:'事故・苦情・ヒヤリの部署集計は記録時所属snapshotで集計します。',
      cross_basis:'横断確認は人数の把握用です。個人順位・危険人物判定・退職予測には使用しません。'
    }
  }
}
module.exports={managementSummary,workforceSummary,coreDeadlineSummary,credentialSummary,supportSummary,workSummary,departmentSummary,crossSignals,currentWhere};
+params.length)}
  if(employeeFilters.length)where.push(`exists(
    select 1 from employees ve
     where (ve.id=v.primary_employee_id or exists(select 1 from vehicle_users vu where vu.vehicle_id=v.id and vu.employee_id=ve.id and vu.ended_on is null))
       and ${employeeFilters.join(' and ')}
  )`);
  const r=await query(`
    select count(*)::int total,
           count(*) filter(where v.status='active')::int active,
           count(*) filter(where v.status<>'inactive' and v.inspection_due<current_date)::int inspection_overdue,
           count(*) filter(where v.status<>'inactive' and v.inspection_due<=current_date+60)::int inspection_due_60,
           count(*) filter(where v.status<>'inactive' and v.next_maintenance_due is not null and v.next_maintenance_due<current_date)::int maintenance_overdue,
           count(*) filter(where v.status<>'inactive' and v.next_maintenance_due is not null and v.next_maintenance_due<=current_date+60)::int maintenance_due_60
      from vehicles v where ${where.join(' and ')}
  `,params);
  return r.rows[0]||{}
}
async function departmentSummary(user,filters,{deadlines=false}={}){
  const {params,where}=currentWhere(user,filters);
  const actionExpr=deadlines
    ?`count(*) filter(where e.lifecycle_status<>'retired' and ((e.license_expiry is not null and e.license_expiry<=current_date+60) or (e.health_check_due is not null and e.health_check_due<=current_date+60) or (e.aptitude_due is not null and e.aptitude_due<=current_date+60)))::int`
    :'null::int';
  const r=await query(`
    select e.office,e.department,
           count(*)::int total,
           count(*) filter(where e.lifecycle_status='active')::int active,
           count(*) filter(where e.lifecycle_status='leave')::int leave_count,
           count(*) filter(where e.lifecycle_status='retirement_planned')::int retirement_planned,
           ${actionExpr} as deadline_action_employees
      from employees e where ${where.join(' and ')}
     group by e.office,e.department
     order by e.office,e.department
  `,params);
  return r.rows
}
async function crossSignals(user,filters,{deadlines=false,assets=false}={}){
  const {params,where}=currentWhere(user,filters);
  const period=safetyWindow(params,filters,'x.event_date');
  const safetyExists=`exists(
    select 1 from (
      select a.employee_id,a.occurred_on event_date from accidents a where a.archived_at is null
      union all select n.employee_id,n.occurred_on from near_misses n where n.archived_at is null
      union all select c.employee_id,coalesce(c.occurrence_date,c.responded_on) from complaints c where c.archived_at is null
    ) x where x.employee_id=e.id and ${period}
  )`;
  const deadlineExpr=deadlines
    ?`count(*) filter(where e.lifecycle_status='active' and ${safetyExists} and ((e.license_expiry is not null and e.license_expiry<=current_date+60) or (e.health_check_due is not null and e.health_check_due<=current_date+60) or (e.aptitude_due is not null and e.aptitude_due<=current_date+60)))::int`
    :'null::int';
  const assetExpr=assets
    ?`count(*) filter(where e.lifecycle_status='retirement_planned' and exists(select 1 from assets a where a.employee_id=e.id and a.status<>'returned'))::int`
    :'null::int';
  const r=await query(`
    select count(*) filter(where e.lifecycle_status='active' and e.hired_on>=current_date-interval '12 months' and ${safetyExists})::int new_hire_with_safety,
           ${deadlineExpr} as safety_and_deadline_action,
           ${assetExpr} as retirement_planned_with_assets
      from employees e where ${where.join(' and ')}
  `,params);
  return r.rows[0]||{}
}
async function managementSummary(user,identity,filters={}){
  const safety=await safetySummary(user,filters);
  const access={
    employees:hasFeaturePermission(user,'employees','view'),
    deadlines:hasFeaturePermission(user,'deadlines','view'),
    credentials:hasFeaturePermission(user,'credentials_documents','view'),
    assets_training:hasFeaturePermission(user,'assets_training','view'),
    work_import:hasFeaturePermission(user,'work_import','view')
  };
  const [workforce,deadlines,credentials,support,work,departments,signals]=await Promise.all([
    access.employees?workforceSummary(user,filters):Promise.resolve(null),
    access.deadlines?coreDeadlineSummary(user,filters):Promise.resolve(null),
    access.credentials?credentialSummary(user,filters):Promise.resolve(null),
    access.assets_training?supportSummary(user,filters):Promise.resolve(null),
    access.work_import?workSummary(user,filters):Promise.resolve(null),
    access.employees?departmentSummary(user,filters,{deadlines:access.deadlines}):Promise.resolve([]),
    access.employees?crossSignals(user,filters,{deadlines:access.deadlines,assets:access.assets_training}):Promise.resolve(null)
  ]);
  return {
    filters:safety.filters,
    access,
    workforce,deadlines,credentials,support,work,signals,departments,
    safety,
    notes:{
      workforce_basis:'人員・期限・資格・教育・貸与品・勤務は現在所属で集計します。',
      safety_basis:'事故・苦情・ヒヤリの部署集計は記録時所属snapshotで集計します。',
      cross_basis:'横断確認は人数の把握用です。個人順位・危険人物判定・退職予測には使用しません。'
    }
  }
}
module.exports={managementSummary,workforceSummary,coreDeadlineSummary,credentialSummary,supportSummary,workSummary,departmentSummary,crossSignals,currentWhere};
