'use strict';

const {Client}=require('pg');

function assert(condition,message){if(!condition)throw new Error(message)}

(async()=>{
  const connectionString=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
  if(!connectionString)throw new Error('TEST_DATABASE_URL or DATABASE_URL is required');
  const client=new Client({connectionString,ssl:process.env.TSUBAME_DB_SSL==='disable'?false:undefined});
  await client.connect();
  try{
    const checks={};
    checks.employee_count=Number((await client.query('select count(*)::int n from employees')).rows[0].n);
    checks.duplicate_current_employee_numbers=Number((await client.query('select count(*)::int n from (select employee_no from employees group by employee_no having count(*)>1)x')).rows[0].n);
    checks.orphan_users=Number((await client.query('select count(*)::int n from users u left join employees e on e.id=u.employee_id where e.id is null')).rows[0].n);
    checks.retired_active_users=Number((await client.query("select count(*)::int n from users u join employees e on e.id=u.employee_id where e.lifecycle_status='retired' and u.state='active'")).rows[0].n);
    checks.active_full_admins=Number((await client.query("select count(*)::int n from users u join employees e on e.id=u.employee_id where u.role_level='full' and u.state='active' and e.lifecycle_status<>'retired'")).rows[0].n);
    checks.orphan_qualifications=Number((await client.query('select count(*)::int n from qualifications q left join employees e on e.id=q.employee_id where e.id is null')).rows[0].n);
    checks.orphan_documents=Number((await client.query('select count(*)::int n from documents d left join employees e on e.id=d.employee_id where e.id is null')).rows[0].n);
    checks.cross_employee_document_qualification=Number((await client.query('select count(*)::int n from documents d join qualifications q on q.id=d.qualification_id where d.qualification_id is not null and q.employee_id<>d.employee_id')).rows[0].n);
    checks.orphan_accidents=Number((await client.query('select count(*)::int n from accidents a left join employees e on e.id=a.employee_id where e.id is null')).rows[0].n);
    checks.orphan_complaints=Number((await client.query('select count(*)::int n from complaints c left join employees e on e.id=c.employee_id where e.id is null')).rows[0].n);
    checks.orphan_near_misses=Number((await client.query('select count(*)::int n from near_misses n left join employees e on e.id=n.employee_id where e.id is null')).rows[0].n);
    checks.orphan_vehicle_users=Number((await client.query('select count(*)::int n from vehicle_users vu left join employees e on e.id=vu.employee_id left join vehicles v on v.id=vu.vehicle_id where e.id is null or v.id is null')).rows[0].n);
    checks.duplicate_active_vehicle_assignments=Number((await client.query("select count(*)::int n from (select vehicle_id,employee_id,role from vehicle_users where ended_on is null group by vehicle_id,employee_id,role having count(*)>1)x")).rows[0].n);
    checks.orphan_work_summaries=Number((await client.query('select count(*)::int n from work_monthly_summaries w left join employees e on e.id=w.employee_id where e.id is null')).rows[0].n);
    checks.orphan_work_changes=Number((await client.query('select count(*)::int n from work_import_changes c left join work_import_batches b on b.id=c.batch_id left join employees e on e.id=c.employee_id where b.id is null or e.id is null')).rows[0].n);

    const lifecycle=await client.query('select lifecycle_status,count(*)::int n from employees group by lifecycle_status order by lifecycle_status');
    const offices=await client.query('select office,count(*)::int n from employees group by office order by office');
    const departments=await client.query('select department,count(*)::int n from employees group by department order by department');

    const mustBeZero=[
      'duplicate_current_employee_numbers','orphan_users','retired_active_users','orphan_qualifications','orphan_documents',
      'cross_employee_document_qualification','orphan_accidents','orphan_complaints','orphan_near_misses','orphan_vehicle_users',
      'duplicate_active_vehicle_assignments','orphan_work_summaries','orphan_work_changes'
    ];
    for(const key of mustBeZero)assert(checks[key]===0,key+' expected 0, got '+checks[key]);
    assert(checks.active_full_admins>=1,'at least one active full administrator is required');

    console.log(JSON.stringify({ok:true,checks,lifecycle:lifecycle.rows,offices:offices.rows,departments:departments.rows,real_employee_data_used:false}))
  }finally{await client.end()}
})().catch(err=>{console.error(err.stack||err);process.exit(1)});
