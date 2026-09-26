'use strict';

const {Client}=require('pg');

function assert(condition,message){if(!condition)throw new Error(message)}
async function expectAppendOnly(client,sql,label){
  try{
    await client.query(sql);
    throw new Error(label+' mutation unexpectedly succeeded');
  }catch(err){
    if(String(err.code)!=='55000')throw err;
  }
}

(async()=>{
  const connectionString=process.env.TEST_DATABASE_URL;
  if(!connectionString)throw new Error('TEST_DATABASE_URL is required');
  const client=new Client({connectionString,ssl:false});
  await client.connect();
  try{
    const objects=await client.query(`
      select
        (select count(*)::int from pg_tables where schemaname='public') as tables,
        to_regclass('public.user_feature_permissions') is not null as feature_permissions_ready,
        to_regclass('public.login_rate_limits') is not null as limiter_ready,
        to_regclass('public.work_import_batches') is not null as work_import_batches_ready,
        to_regclass('public.work_import_rows') is not null as work_import_rows_ready,
        to_regclass('public.work_summary_monthly') is not null as work_summary_ready,
        to_regclass('public.near_miss_monthly_targets') is not null as targets_ready,
        to_regclass('public.near_miss_monthly_compliance') is not null as compliance_ready,
        exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='audit_logs' and t.tgname='audit_logs_append_only_guard' and not t.tgisinternal) as audit_guard,
        exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='record_histories' and t.tgname='record_histories_append_only_guard' and not t.tgisinternal) as history_guard
    `);
    const o=objects.rows[0];
    assert(Number(o.tables)===34,'restored table count expected 34, got '+o.tables);
    assert(o.feature_permissions_ready&&o.limiter_ready&&o.work_import_batches_ready&&o.work_import_rows_ready&&o.work_summary_ready&&o.targets_ready&&o.compliance_ready&&o.audit_guard&&o.history_guard,'restored schema protection missing: '+JSON.stringify(o));

    const counts=await client.query(`
      select
        (select count(*)::int from employees where employee_no like 'CI9%') as employees,
        (select count(*)::int from near_misses where report_no like 'CI-N-%') as near_misses,
        (select count(*)::int from near_miss_monthly_targets where month_start=date '2099-01-01') as targets,
        (select count(*)::int from work_import_batches) as work_import_batches,
        (select count(*)::int from work_import_rows) as work_import_rows,
        (select count(*)::int from work_summary_monthly) as work_summaries
    `);
    const n=counts.rows[0];
    assert(n.employees===4,'restored fictional employee count mismatch: '+JSON.stringify(n));
    assert(n.near_misses===3,'restored near-miss count mismatch: '+JSON.stringify(n));
    assert(n.targets===4,'restored monthly target count mismatch: '+JSON.stringify(n));
    assert(n.work_import_batches===3,'restored work import batch count mismatch: '+JSON.stringify(n));
    assert(n.work_import_rows===4,'restored work import row count mismatch: '+JSON.stringify(n));
    assert(n.work_summaries===1,'restored work summary count mismatch: '+JSON.stringify(n));

    const compliance=await client.query(`
      select employee_no_snapshot,compliance_state
        from near_miss_monthly_compliance
       where month_start=date '2099-01-01'
       order by employee_no_snapshot
    `);
    const states=Object.fromEntries(compliance.rows.map(x=>[x.employee_no_snapshot,x.compliance_state]));
    assert(states.CI9001==='zero','restored zero state mismatch: '+JSON.stringify(states));
    assert(states.CI9002==='short','restored short state mismatch: '+JSON.stringify(states));
    assert(states.CI9003==='met','restored met state mismatch: '+JSON.stringify(states));
    assert(states.CI9004==='exempt','restored exempt state mismatch: '+JSON.stringify(states));

    await expectAppendOnly(client,"update audit_logs set summary='restore mutation' where entity_id='audit-1'",'restored audit_logs update');
    await expectAppendOnly(client,"delete from record_histories where entity_id='history-1'",'restored record_histories delete');

    console.log(JSON.stringify({
      ok:true,
      restored_tables:Number(o.tables),
      fictional_employees:n.employees,
      near_misses:n.near_misses,
      monthly_targets:n.targets,
      work_import_batches:n.work_import_batches,
      work_import_rows:n.work_import_rows,
      work_summaries:n.work_summaries,
      compliance_states:states,
      append_only_enforced_after_restore:true,
      distributed_login_rate_limit_ready:true,
      work_import_persistence_ready:true,
      real_employee_data_used:false
    }));
  }finally{
    await client.end();
  }
})().catch(err=>{
  console.error(err.stack||err);
  process.exit(1);
});
