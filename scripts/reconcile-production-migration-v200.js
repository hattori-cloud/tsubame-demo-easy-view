'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('pg');

function fail(message,details){const e=new Error(message);e.details=details;throw e}
function sameObject(actual,expected,label){
  const keys=new Set([...Object.keys(actual||{}),...Object.keys(expected||{})]);
  const diff=[];
  for(const k of keys)if(Number(actual?.[k]||0)!==Number(expected?.[k]||0))diff.push({key:k,expected:Number(expected?.[k]||0),actual:Number(actual?.[k]||0)});
  if(diff.length)fail(label+' reconciliation mismatch',diff)
}
async function rowsToMap(client,sql){
  const r=await client.query(sql);
  return Object.fromEntries(r.rows.map(x=>[String(x.key),Number(x.n)]))
}

(async()=>{
  const connectionString=process.env.MIGRATION_DATABASE_URL||process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
  if(!connectionString)throw new Error('MIGRATION_DATABASE_URL or TEST_DATABASE_URL is required');

  const manifestPath=process.env.MIGRATION_MANIFEST_PATH||'';
  const expected=manifestPath?JSON.parse(fs.readFileSync(path.resolve(manifestPath),'utf8')):null;

  const client=new Client({connectionString,ssl:process.env.TSUBAME_DB_SSL==='disable'?false:undefined});
  await client.connect();
  try{
    const totals=(await client.query(`
      select
        (select count(*)::int from employees) as employees,
        (select count(*)::int from users) as users,
        (select count(*)::int from qualifications) as qualifications,
        (select count(*)::int from documents) as documents,
        (select count(*)::int from vehicles) as vehicles,
        (select count(*)::int from accidents) as accidents,
        (select count(*)::int from complaints) as complaints,
        (select count(*)::int from near_misses) as near_misses
    `)).rows[0];

    const lifecycle=await rowsToMap(client,`
      select lifecycle_status as key,count(*)::int n from employees group by lifecycle_status order by lifecycle_status
    `);
    const office=await rowsToMap(client,`
      select office as key,count(*)::int n from employees group by office order by office
    `);
    const department=await rowsToMap(client,`
      select department as key,count(*)::int n from employees group by department order by department
    `);

    const integrity=(await client.query(`
      select
        (select count(*)::int from (select employee_no from employees group by employee_no having count(*)>1) x) as duplicate_current_employee_no,
        (select count(*)::int from employee_number_history h left join employees e on e.id=h.employee_id where e.id is null) as orphan_employee_number_history,
        (select count(*)::int from (
          select employee_no from (
            select id as employee_id,employee_no from employees
            union all select employee_id,old_employee_no as employee_no from employee_number_history
            union all select employee_id,new_employee_no as employee_no from employee_number_history
          ) n group by employee_no having count(distinct employee_id)>1
        ) x) as employee_number_cross_employee_reuse,
        (select count(*)::int from employees e join lateral (
          select h.new_employee_no from employee_number_history h
           where h.employee_id=e.id
           order by h.changed_at desc,h.id desc limit 1
        ) latest on true where latest.new_employee_no<>e.employee_no) as employee_number_latest_mismatch,
        (select count(*)::int from users u left join employees e on e.id=u.employee_id where e.id is null) as orphan_users,
        (select count(*)::int from qualifications q left join employees e on e.id=q.employee_id where e.id is null) as orphan_qualifications,
        (select count(*)::int from documents d left join employees e on e.id=d.employee_id where e.id is null) as orphan_documents,
        (select count(*)::int from documents d join qualifications q on q.id=d.qualification_id where d.qualification_id is not null and q.employee_id<>d.employee_id) as cross_employee_document_qualification,
        (select count(*)::int from vehicle_users vu left join employees e on e.id=vu.employee_id where e.id is null) as orphan_vehicle_users,
        (select count(*)::int from accidents a left join employees e on e.id=a.employee_id where e.id is null) as orphan_accidents,
        (select count(*)::int from complaints c left join employees e on e.id=c.employee_id where e.id is null) as orphan_complaints,
        (select count(*)::int from near_misses n left join employees e on e.id=n.employee_id where e.id is null) as orphan_near_misses,
        (select count(*)::int from users u join employees e on e.id=u.employee_id where e.lifecycle_status='retired' and u.state='active') as active_accounts_for_retired,
        (select count(*)::int from users u join employees e on e.id=u.employee_id where u.role_level='full' and u.state='active' and e.lifecycle_status<>'retired') as active_full_admins
    `)).rows[0];

    const warningKeys=new Set(['employee_number_cross_employee_reuse']);
    const nonzero=Object.entries(integrity).filter(([k,v])=>k!=='active_full_admins'&&!warningKeys.has(k)&&Number(v)!==0);
    if(nonzero.length)fail('migration referential integrity failed',Object.fromEntries(nonzero));
    if(Number(integrity.active_full_admins)<1)fail('migration left no active full administrator',{active_full_admins:integrity.active_full_admins});
    const warnings=Object.fromEntries(
      [...warningKeys].filter(k=>Number(integrity[k]||0)!==0).map(k=>[k,Number(integrity[k])])
    );

    if(expected){
      if(expected.totals)sameObject(totals,expected.totals,'total');
      if(expected.lifecycle)sameObject(lifecycle,expected.lifecycle,'lifecycle');
      if(expected.office)sameObject(office,expected.office,'office');
      if(expected.department)sameObject(department,expected.department,'department');
    }

    const result={
      ok:true,
      totals,
      lifecycle,
      office,
      department,
      integrity:{...integrity,active_full_admins:Number(integrity.active_full_admins)},
      warnings,
      manifest_checked:Boolean(expected),
      real_employee_data_echoed:false
    };
    console.log(JSON.stringify(result))
  }finally{await client.end()}
})().catch(err=>{
  console.error(JSON.stringify({ok:false,message:err.message,details:err.details||null}));
  process.exit(1)
});
