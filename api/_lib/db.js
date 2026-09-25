const {Pool}=require('pg');
const {databaseEnvPresent}=require('./runtime-config');

let pool=null;

function dbProblem(code,message){
  const err=new Error(message);
  err.status=503;
  err.code=code;
  return err
}
function connectionString(){
  return process.env.DATABASE_URL||process.env.TSUBAME_DATABASE_URL||''
}
function sslConfig(){
  if(process.env.TSUBAME_DB_SSL==='disable')return false;
  const reject=process.env.TSUBAME_DB_SSL_REJECT_UNAUTHORIZED!=='0';
  return {rejectUnauthorized:reject}
}
function getPool(){
  if(!databaseEnvPresent())throw dbProblem('DATABASE_NOT_CONFIGURED','本番データベースが未接続です');
  if(!pool){
    const max=Math.min(20,Math.max(1,Number.parseInt(process.env.TSUBAME_DB_POOL_MAX||'5',10)||5));
    pool=new Pool({
      connectionString:connectionString(),
      ssl:sslConfig(),
      max,
      idleTimeoutMillis:30000,
      connectionTimeoutMillis:5000,
      application_name:'tsubame-v200-api'
    });
    pool.on('error',()=>{})
  }
  return pool
}
async function query(text,params=[],client=null){
  const target=client||getPool();
  return target.query(text,params)
}
async function withTransaction(work){
  const client=await getPool().connect();
  try{
    await client.query('begin');
    const result=await work(client);
    await client.query('commit');
    return result
  }catch(err){
    try{await client.query('rollback')}catch(_){}
    throw err
  }finally{client.release()}
}
async function probeDatabaseReadiness(){
  const empty={connected:false,core_schema_ready:false,audit_append_only_ready:false,capacity_ready:false,auth_rate_limit_ready:false,work_import_ready:false,runtime_role_ready:false};
  if(!databaseEnvPresent())return empty;
  try{
    const r=await query(`
      select
        to_regclass('public.employees') is not null as employees_ready,
        to_regclass('public.users') is not null as users_ready,
        to_regclass('public.audit_logs') is not null as audit_logs_ready,
        to_regclass('public.record_histories') is not null as record_histories_ready,
        to_regclass('public.documents') is not null as documents_ready,
        to_regclass('public.document_purge_requests') is not null as purge_ready,
        to_regclass('public.login_rate_limits') is not null as auth_rate_limit_ready,
        to_regclass('public.work_import_batches') is not null as work_import_batches_ready,
        to_regclass('public.work_import_rows') is not null as work_import_rows_ready,
        to_regclass('public.work_summary_monthly') is not null as work_summary_ready,
        exists(
          select 1 from pg_roles r
           where r.rolname=current_user
             and r.rolsuper=false
             and r.rolcreatedb=false
             and r.rolcreaterole=false
        ) and pg_has_role(current_user,'tsubame_app_runtime','member') as runtime_role_ready,
        to_regclass('public.near_miss_monthly_targets') is not null as capacity_targets_ready,
        to_regclass('public.near_miss_monthly_compliance') is not null as capacity_view_ready,
        exists(
          select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
           where c.relname='audit_logs' and t.tgname='audit_logs_append_only_guard'
             and not t.tgisinternal and t.tgenabled<>'D'
        ) as audit_guard_ready,
        exists(
          select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid
           where c.relname='record_histories' and t.tgname='record_histories_append_only_guard'
             and not t.tgisinternal and t.tgenabled<>'D'
        ) as history_guard_ready
    `);
    const x=r.rows[0]||{};
    return {
      connected:true,
      core_schema_ready:Boolean(x.employees_ready&&x.users_ready&&x.audit_logs_ready&&x.record_histories_ready&&x.documents_ready&&x.purge_ready),
      audit_append_only_ready:Boolean(x.audit_guard_ready&&x.history_guard_ready),
      capacity_ready:Boolean(x.capacity_targets_ready&&x.capacity_view_ready),
      auth_rate_limit_ready:Boolean(x.auth_rate_limit_ready),
      work_import_ready:Boolean(x.work_import_batches_ready&&x.work_import_rows_ready&&x.work_summary_ready),
      runtime_role_ready:Boolean(x.runtime_role_ready)
    }
  }catch(_){return empty}
}
async function closePool(){
  if(pool){const p=pool;pool=null;await p.end()}
}
module.exports={databaseConfigured:databaseEnvPresent,getPool,query,withTransaction,probeDatabaseReadiness,closePool};
