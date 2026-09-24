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
    assert(baseTables.rows[0].n===22,'base schema table count expected 22, got '+baseTables.rows[0].n);

    const baseChecks=await client.query(`
      select
        to_regclass('public.employees') is not null as employees_ready,
        to_regclass('public.users') is not null as users_ready,
        to_regclass('public.documents') is not null as documents_ready,
        to_regclass('public.document_purge_requests') is not null as purge_ready,
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
