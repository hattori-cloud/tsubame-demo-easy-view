'use strict';

const fs=require('node:fs');
const path=require('node:path');
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
    const base=fs.readFileSync(path.join(__dirname,'..','docs','production-schema.sql'),'utf8');
    const capacity=fs.readFileSync(path.join(__dirname,'..','docs','production-capacity-v189.sql'),'utf8');

    await client.query(base);

    const baseTables=await client.query("select count(*)::int as n from pg_tables where schemaname='public'");
    assert(baseTables.rows[0].n===33,'base schema table count expected 33, got '+baseTables.rows[0].n);

    const baseChecks=await client.query(`
      select
        to_regclass('public.employees') is not null as employees_ready,
        to_regclass('public.users') is not null as users_ready,
        to_regclass('public.documents') is not null as documents_ready,
        to_regclass('public.document_purge_requests') is not null as purge_ready,
        to_regclass('public.document_upload_tickets') is not null as upload_tickets_ready,
        to_regclass('public.login_rate_limits') is not null as rate_limit_ready,
        to_regclass('public.work_import_batches') is not null as work_import_batches_ready,
        to_regclass('public.work_monthly_summaries') is not null as work_summaries_ready,
        to_regclass('public.work_import_changes') is not null as work_import_changes_ready,
        exists(select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='content_sha256') as sha_ready,
        exists(select 1 from information_schema.columns where table_schema='public' and table_name='documents' and column_name='malware_scan_status') as malware_ready,
        exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='audit_logs' and t.tgname='audit_logs_append_only_guard' and not t.tgisinternal) as audit_guard,
        exists(select 1 from pg_trigger t join pg_class c on c.oid=t.tgrelid where c.relname='record_histories' and t.tgname='record_histories_append_only_guard' and not t.tgisinternal) as history_guard
    `);
    const bc=baseChecks.rows[0];
    assert(Object.values(bc).every(Boolean),'base schema readiness checks failed: '+JSON.stringify(bc));

    await client.query("insert into audit_logs(action,entity_type,entity_id,result,summary) values('ci_probe','ci','audit-1','success','fictional CI probe')");
    await client.query("insert into record_histories(entity_type,entity_id,action,reason) values('ci','history-1','ci_probe','fictional CI probe')");
    await expectAppendOnly(client,"update audit_logs set summary='mutated' where entity_id='audit-1'",'audit_logs update');
    await expectAppendOnly(client,"delete from audit_logs where entity_id='audit-1'",'audit_logs delete');
    await expectAppendOnly(client,"update record_histories set reason='mutated' where entity_id='history-1'",'record_histories update');
    await expectAppendOnly(client,"delete from record_histories where entity_id='history-1'",'record_histories delete');

    await client.query(capacity);

    const capacityChecks=await client.query(`
      select
        to_regclass('public.near_miss_monthly_targets') is not null as targets_ready,
        to_regclass('public.near_miss_monthly_compliance') is not null as view_ready
    `);
    assert(Object.values(capacityChecks.rows[0]).every(Boolean),'capacity schema readiness failed');

    const duplicateIndexes=await client.query(`
      select indrelid::regclass::text as table_name,indkey::text,indisunique,indisprimary,
             coalesce(pg_get_expr(indpred,indrelid),'') as predicate,count(*)::int as n
        from pg_index
       where indrelid in (select oid from pg_class where relnamespace='public'::regnamespace and relkind='r')
       group by indrelid,indkey,indisunique,indisprimary,coalesce(pg_get_expr(indpred,indrelid),'')
      having count(*)>1
    `);
    assert(duplicateIndexes.rows.length===0,'duplicate structural indexes found: '+JSON.stringify(duplicateIndexes.rows));

    const emps=await client.query(`
      insert into employees(employee_no,name,office,department,lifecycle_status)
      values
        ('CI9001','架空監査A','本社','タクシー課','active'),
        ('CI9002','架空監査B','本社','タクシー課','active'),
        ('CI9003','架空監査C','本社','タクシー課','active'),
        ('CI9004','架空監査D','本社','タクシー課','active')
      returning id,employee_no,name
    `);
    const [a,b,c,d]=emps.rows;

    const admins=await client.query(`
      insert into users(employee_id,login_id,password_hash,display_name,role_level,state,mfa_required)
      values
        ($1,'ci-admin-a','ci-hash-a','CI架空管理者A','full','active',true),
        ($2,'ci-admin-b','ci-hash-b','CI架空管理者B','full','active',true)
      returning id
    `,[a.id,b.id]);
    const [adminA,adminB]=admins.rows;
    const {lockFullAdminContinuity,requireOtherActiveFullAdmin}=require('../api/_lib/admin-continuity');
    await client.query('begin');
    try{
      await lockFullAdminContinuity(client);
      await requireOtherActiveFullAdmin([adminA.id],client);
      let blocked=false;
      try{await requireOtherActiveFullAdmin([adminA.id,adminB.id],client)}catch(err){
        blocked=err&&err.code==='LAST_FULL_ADMIN_REQUIRED'
      }
      assert(blocked,'last full administrator guard did not reject removing all active full admins')
    }finally{
      await client.query('rollback')
    }

    const {recordLoginFailure:recordNetworkLoginFailure,state:rateLimitState}=require('../api/_lib/login-rate-limit');
    const sourceKey='aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa';
    const sourceLoginKey='bbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbbb';
    const limiterClients=[];
    try{
      for(let i=0;i<10;i++){
        const c2=new Client({connectionString,ssl:false});await c2.connect();limiterClients.push(c2)
      }
      await Promise.all(limiterClients.map(c2=>recordNetworkLoginFailure({sourceKey,sourceLoginKey},c2)));
      const sourceState=await rateLimitState(sourceKey,client);
      const sourceLoginState=await rateLimitState(sourceLoginKey,client);
      assert(sourceState&&sourceState.failure_count===10&&!sourceState.blocked,'source limiter unexpected: '+JSON.stringify(sourceState));
      assert(sourceLoginState&&sourceLoginState.failure_count===10&&sourceLoginState.blocked,'source+login limiter did not block atomically: '+JSON.stringify(sourceLoginState))
    }finally{
      await Promise.all(limiterClients.map(c2=>c2.end()))
    }

    const challenge=(await client.query(`
      insert into mfa_challenges(user_id,challenge_hash,purpose,expires_at)
      values($1,'ci-concurrent-mfa-challenge','verify',now()+interval '5 minutes')
      returning id
    `,[adminA.id])).rows[0];
    const secondClient=new Client({connectionString,ssl:false});
    await secondClient.connect();
    try{
      const {markMfaVerified}=require('../api/_lib/auth-store');
      const consumed=await Promise.all([
        markMfaVerified(challenge.id,client),
        markMfaVerified(challenge.id,secondClient)
      ]);
      const counts=consumed.map(x=>x.rowCount).sort();
      assert(counts[0]===0&&counts[1]===1,'MFA challenge was not single-use under concurrent consumption: '+JSON.stringify(counts))
    }finally{
      await secondClient.end()
    }

    for(const [emp,state,reason] of [
      [a,'required',null],[b,'required',null],[c,'required',null],[d,'exempt','CI架空免除']
    ]){
      await client.query(`
        insert into near_miss_monthly_targets(
          month_start,employee_id,employee_no_snapshot,employee_name_snapshot,
          office_snapshot,department_snapshot,target_count,requirement_state,exemption_reason
        ) values(date '2099-01-01',$1,$2,$3,'本社','タクシー課',2,$4,$5)
      `,[emp.id,emp.employee_no,emp.name,state,reason]);
    }

    async function addNear(emp,no,day){
      await client.query(`
        insert into near_misses(
          report_no,employee_id,occurred_on,reported_on,summary,
          employee_no_at_report,office_at_report,department_at_report
        ) values($1,$2,$3,$3,'CI架空ヒヤリ',$4,'本社','タクシー課')
      `,[no,emp.id,day,emp.employee_no]);
    }
    await addNear(b,'CI-N-001','2099-01-10');
    await addNear(c,'CI-N-002','2099-01-11');
    await addNear(c,'CI-N-003','2099-01-12');

    const compliance=await client.query(`
      select employee_no_snapshot,compliance_state,submitted_count,remaining_count
        from near_miss_monthly_compliance
       where month_start=date '2099-01-01'
       order by employee_no_snapshot
    `);
    const states=Object.fromEntries(compliance.rows.map(x=>[x.employee_no_snapshot,x.compliance_state]));
    assert(states.CI9001==='zero','expected zero: '+JSON.stringify(states));
    assert(states.CI9002==='short','expected short: '+JSON.stringify(states));
    assert(states.CI9003==='met','expected met: '+JSON.stringify(states));
    assert(states.CI9004==='exempt','expected exempt: '+JSON.stringify(states));

    console.log(JSON.stringify({
      ok:true,
      base_tables:baseTables.rows[0].n,
      capacity_targets:true,
      capacity_view:true,
      append_only_enforced:true,
      full_admin_continuity_guard:true,
      mfa_challenge_single_use:true,
      distributed_login_rate_limiter:true,
      duplicate_structural_indexes:0,
      compliance_states:states,
      real_employee_data_used:false
    }));
  }finally{
    await client.end();
  }
})().catch(err=>{
  console.error(err.stack||err);
  process.exit(1);
});
