'use strict';

process.env.DATABASE_URL=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
process.env.TSUBAME_DB_SSL='disable';

const assert=require('node:assert/strict');
const db=require('../api/_lib/db');
const store=require('../api/_lib/work-import-store');

(async()=>{
  const adminEmployee=(await db.query("insert into employees(employee_no,name,office,department,lifecycle_status) values('WI-ADMIN','架空取込管理者','本社','タクシー課','active') returning id")).rows[0];
  const admin=(await db.query("insert into users(employee_id,login_id,password_hash,display_name,role_level,state,mfa_required) values($1,'wi-admin','ci-hash','架空取込管理者','full','active',true) returning id,role_level",[adminEmployee.id])).rows[0];
  const a=(await db.query("insert into employees(employee_no,name,office,department,lifecycle_status) values('WI1001','架空勤務A','本社','タクシー課','active') returning id")).rows[0];
  const b=(await db.query("insert into employees(employee_no,name,office,department,lifecycle_status) values('WI1002','架空勤務B','本社','タクシー課','active') returning id")).rows[0];
  await db.query("insert into employee_number_history(employee_id,old_employee_no,new_employee_no,reason) values($1,'WI-OLD','WI1002','CI旧番号')",[b.id]);

  const batch1=await store.commitWorkImport({user:admin,fileName:'ci-work-1.xlsx',sha256:'1111111111111111111111111111111111111111111111111111111111111111',requestId:'wi-1',rows:[
    {employee_no:'WI1001',month:'2026-09',restraint:220,remaining:80,overtime:20,last_posted:'2026-09-20'},
    {employee_no:'WI-OLD',month:'2026-09',restraint:230,remaining:70,overtime:30,last_posted:'2026-09-20'}
  ]});
  assert.equal(batch1.status,'committed');
  assert.equal(batch1.inserted_count,2);
  assert.equal(batch1.updated_count,0);

  await assert.rejects(
    ()=>store.commitWorkImport({user:admin,fileName:'ci-work-1.xlsx',sha256:'1111111111111111111111111111111111111111111111111111111111111111',requestId:'wi-dup',rows:[{employee_no:'WI1001',month:'2026-09',restraint:220,remaining:80,overtime:20,last_posted:'2026-09-20'}]}),
    e=>e?.code==='IMPORT_ALREADY_COMMITTED'
  );

  const batch2=await store.commitWorkImport({user:admin,fileName:'ci-work-2.xlsx',sha256:'2222222222222222222222222222222222222222222222222222222222222222',requestId:'wi-2',rows:[
    {employee_no:'WI1001',month:'2026-09',restraint:221,remaining:79,overtime:21,last_posted:'2026-09-21'},
    {employee_no:'WI1002',month:'2026-09',restraint:230,remaining:70,overtime:30,last_posted:'2026-09-20'}
  ]});
  assert.equal(batch2.updated_count,1);
  assert.equal(batch2.unchanged_count,1);

  await assert.rejects(
    ()=>store.rollbackWorkImport({user:admin,batchId:batch1.id,reason:'後続更新があるため拒否確認',requestId:'wi-rb-conflict'}),
    e=>e?.code==='ROLLBACK_CONFLICT'
  );
  const afterConflict=(await db.query("select count(*)::int n from work_monthly_summaries where employee_id in ($1,$2)",[a.id,b.id])).rows[0].n;
  assert.equal(afterConflict,2);

  const rolled2=await store.rollbackWorkImport({user:admin,batchId:batch2.id,reason:'CI後続バッチを戻す',requestId:'wi-rb-2'});
  assert.equal(rolled2.status,'rolled_back');
  const restoredA=(await db.query("select overtime_hours,source_batch_id,version from work_monthly_summaries where employee_id=$1 and month_start=date '2026-09-01'",[a.id])).rows[0];
  assert.equal(Number(restoredA.overtime_hours),20);
  assert.equal(String(restoredA.source_batch_id),String(batch1.id));
  assert.ok(Number(restoredA.version)>=3);

  const rolled1=await store.rollbackWorkImport({user:admin,batchId:batch1.id,reason:'CI初回バッチを戻す',requestId:'wi-rb-1'});
  assert.equal(rolled1.status,'rolled_back');
  const remaining=(await db.query("select count(*)::int n from work_monthly_summaries where employee_id in ($1,$2)",[a.id,b.id])).rows[0].n;
  assert.equal(remaining,0);

  const history=await store.listWorkImports({user:admin,filters:{page:1,page_size:10}});
  assert.ok(history.items.some(x=>String(x.id)===String(batch1.id)&&x.status==='rolled_back'));
  assert.ok(history.items.some(x=>String(x.id)===String(batch2.id)&&x.status==='rolled_back'));
  const changes=(await db.query("select count(*)::int n from work_import_changes where batch_id in ($1,$2)",[batch1.id,batch2.id])).rows[0].n;
  assert.equal(changes,3);

  let appendOnly=false;
  try{await db.query("delete from work_import_changes where batch_id=$1",[batch1.id])}catch(err){appendOnly=String(err.code)==='55000'}
  assert.equal(appendOnly,true);

  console.log(JSON.stringify({ok:true,commit_insert:2,second_update:1,second_unchanged:1,rollback_conflict:true,rollback_chain:true,history_rows:changes,old_employee_number_resolved:true,real_employee_data_used:false}))
})().catch(err=>{console.error(err.stack||err);process.exit(1)}).finally(async()=>{await db.closePool()});
