'use strict';

const {Client}=require('pg');

function assert(condition,message){if(!condition)throw new Error(message)}
async function expectDenied(client,sql,label){
  try{
    await client.query(sql);
    throw new Error(label+' unexpectedly succeeded')
  }catch(err){
    if(String(err.code)!=='42501')throw err
  }
}

(async()=>{
  const connectionString=process.env.TEST_DATABASE_URL;
  if(!connectionString)throw new Error('TEST_DATABASE_URL is required');
  const client=new Client({connectionString,ssl:false});
  await client.connect();
  try{
    const roles=await client.query(`
      select rolname,rolcanlogin,rolsuper,rolcreatedb,rolcreaterole,rolreplication,rolbypassrls
        from pg_roles
       where rolname in ('tsubame_app_runtime','tsubame_maintenance','tsubame_migrator')
       order by rolname
    `);
    assert(roles.rows.length===3,'expected runtime, maintenance and migrator roles');
    for(const r of roles.rows){
      assert(r.rolcanlogin===false,r.rolname+' must be NOLOGIN');
      assert(r.rolsuper===false,r.rolname+' must not be superuser');
      assert(r.rolcreatedb===false,r.rolname+' must not CREATEDB');
      assert(r.rolcreaterole===false,r.rolname+' must not CREATEROLE');
      assert(r.rolreplication===false,r.rolname+' must not REPLICATION');
      assert(r.rolbypassrls===false,r.rolname+' must not BYPASSRLS');
    }

    await client.query('set role tsubame_app_runtime');
    await client.query('select count(*) from employees');
    await client.query(`
      insert into login_rate_limits(key_hash,kind,failure_count)
      values(repeat('a',64),'source',1)
      on conflict(key_hash) do update set failure_count=excluded.failure_count,updated_at=now()
    `);
    await client.query("delete from login_rate_limits where key_hash=repeat('a',64)");
    await client.query('delete from work_summary_monthly where false');
    await expectDenied(client,'create table public.ci_runtime_should_fail(id integer)','runtime CREATE TABLE');
    await expectDenied(client,'delete from employees where false','runtime DELETE employees');
    await expectDenied(client,"update audit_logs set summary='forbidden' where false",'runtime UPDATE audit_logs');
    await expectDenied(client,'delete from record_histories where false','runtime DELETE record_histories');
    await client.query('reset role');

    await client.query('set role tsubame_maintenance');
    await client.query('select count(*) from auth_sessions');
    await client.query('delete from login_rate_limits where false');
    await client.query('update work_import_batches set updated_at=updated_at where false');
    await expectDenied(client,'delete from employees where false','maintenance DELETE employees');
    await expectDenied(client,"update audit_logs set summary='forbidden' where false",'maintenance UPDATE audit_logs');
    await client.query('reset role');

    await client.query('set role tsubame_migrator');
    await client.query('create table public.ci_migrator_probe(id integer)');
    await client.query('drop table public.ci_migrator_probe');
    await client.query('reset role');

    console.log(JSON.stringify({
      ok:true,
      runtime_role_nologin:true,
      runtime_ddl_denied:true,
      runtime_employee_delete_denied:true,
      runtime_audit_mutation_denied:true,
      runtime_work_import_rollback_delete_allowed:true,
      maintenance_auth_cleanup_allowed:true,
      maintenance_employee_delete_denied:true,
      maintenance_audit_mutation_denied:true,
      migrator_ddl_allowed:true,
      real_employee_data_used:false
    }))
  }finally{
    try{await client.query('reset role')}catch(_){}
    await client.end()
  }
})().catch(err=>{
  console.error(err.stack||err);
  process.exit(1)
});
