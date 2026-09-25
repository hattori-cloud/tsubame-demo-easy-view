'use strict';

process.env.DATABASE_URL=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
process.env.TSUBAME_DB_SSL='disable';

const db=require('../api/_lib/db');
const store=require('../api/_lib/work-import-store');

function assert(condition,message){if(!condition)throw new Error(message)}
async function expectCode(promise,code){
  try{await promise;throw new Error('expected '+code)}
  catch(err){if(err?.code!==code)throw err}
}

(async()=>{
  const admins=(await db.query(`
    select u.id,u.role_level,u.display_name
      from users u
     where u.role_level='full'
     order by u.login_id
  `)).rows;
  assert(admins.length>=2,'two fictional full admins are required');
  const [adminA,adminB]=admins;

  const preflight={
    can_commit:true,file_name:'fictional-work.xlsx',
    sha256:'a'.repeat(64),warning_count:0
  };
  const rows=[
    {row:2,employee_no:'CI9001',month:'2099-02',restraint:220,remaining:80,overtime:40,last_posted:'2099-02-20'},
    {row:3,employee_no:'CI9002',month:'2099-02',restraint:230,remaining:70,overtime:50,last_posted:'2099-02-20'}
  ];

  const batch=await store.createWorkImportPreflight({
    user:adminA,preflight,rows,requestId:'ci-work-preflight-1'
  });
  assert(batch.state==='preflight'&&Number(batch.version)===1,'preflight batch state/version mismatch');

  const committed=await store.commitWorkImport({
    user:adminA,batchId:batch.id,expectedVersion:1,requestId:'ci-work-commit-1'
  });
  assert(committed.batch.state==='committed','batch did not commit');
  assert(Number(committed.batch.version)===2,'committed batch version expected 2');
  assert(committed.committed_count===2,'committed row count mismatch');

  const summaries=(await db.query(`
    select employee_id,month_start,source_batch_id,version
      from work_summary_monthly
     where month_start=date '2099-02-01'
     order by employee_id
  `)).rows;
  assert(summaries.length===2,'expected two committed work summaries');
  assert(summaries.every(x=>String(x.source_batch_id)===String(batch.id)),'source batch mismatch after commit');

  const commitHistories=(await db.query(`
    select count(*)::int n from record_histories
     where entity_type='work_summary_monthly' and action='work_import_commit'
  `)).rows[0].n;
  assert(commitHistories>=2,'work import commit histories missing');

  const rolled=await store.rollbackWorkImport({
    user:adminA,batchId:batch.id,expectedVersion:2,reason:'fictional CI rollback',requestId:'ci-work-rollback-1'
  });
  assert(rolled.batch.state==='rolled_back','batch did not roll back');
  assert(Number(rolled.batch.version)===3,'rolled back batch version expected 3');
  assert(rolled.removed_count===2,'newly inserted summaries were not removed on rollback');
  const remaining=(await db.query("select count(*)::int n from work_summary_monthly where month_start=date '2099-02-01'")).rows[0].n;
  assert(remaining===0,'rolled back summaries still exist');

  const conflictBatch=await store.createWorkImportPreflight({
    user:adminA,
    preflight:{...preflight,sha256:'b'.repeat(64),file_name:'fictional-conflict.xlsx'},
    rows:[{row:2,employee_no:'CI9001',month:'2099-03',restraint:210,remaining:90,overtime:35,last_posted:'2099-03-20'}],
    requestId:'ci-work-preflight-2'
  });
  const conflictCommit=await store.commitWorkImport({
    user:adminA,batchId:conflictBatch.id,expectedVersion:1,requestId:'ci-work-commit-2'
  });
  await db.query(`
    update work_summary_monthly
       set overtime_hours=overtime_hours+1,updated_at=now(),version=version+1
     where source_batch_id=$1
  `,[conflictBatch.id]);
  await expectCode(
    store.rollbackWorkImport({
      user:adminA,batchId:conflictBatch.id,expectedVersion:conflictCommit.batch.version,
      reason:'must conflict',requestId:'ci-work-rollback-conflict'
    }),
    'ROLLBACK_CONFLICT'
  );
  const stillCommitted=(await db.query('select state from work_import_batches where id=$1',[conflictBatch.id])).rows[0];
  assert(stillCommitted.state==='committed','rollback conflict changed batch state');

  const ownedBatch=await store.createWorkImportPreflight({
    user:adminA,
    preflight:{...preflight,sha256:'c'.repeat(64),file_name:'fictional-owner.xlsx'},
    rows:[{row:2,employee_no:'CI9002',month:'2099-04',restraint:205,remaining:95,overtime:30,last_posted:'2099-04-20'}],
    requestId:'ci-work-preflight-3'
  });
  await expectCode(
    store.commitWorkImport({
      user:adminB,batchId:ownedBatch.id,expectedVersion:1,requestId:'ci-work-owner-conflict'
    }),
    'WORK_IMPORT_OWNER_REQUIRED'
  );

  await expectCode(
    store.createWorkImportPreflight({
      user:adminA,
      preflight:{...preflight,sha256:'d'.repeat(64),file_name:'fictional-unknown.xlsx'},
      rows:[{row:2,employee_no:'CI-NOT-EXISTS',month:'2099-05',restraint:200,remaining:100,overtime:20,last_posted:'2099-05-20'}],
      requestId:'ci-work-unknown'
    }),
    'UNKNOWN_EMPLOYEE_NUMBER'
  );

  const rollbackHistories=(await db.query(`
    select count(*)::int n from record_histories
     where entity_type='work_summary_monthly' and action='work_import_rollback'
  `)).rows[0].n;
  assert(rollbackHistories>=2,'work import rollback histories missing');

  console.log(JSON.stringify({
    ok:true,
    preflight_persisted:true,
    commit_atomic:true,
    rollback_restored:true,
    rollback_conflict_protected:true,
    batch_owner_enforced:true,
    unknown_employee_rejected:true,
    commit_history_rows:commitHistories,
    rollback_history_rows:rollbackHistories,
    real_employee_data_used:false
  }))
})().catch(err=>{
  console.error(err.stack||err);
  process.exitCode=1
}).finally(async()=>{await db.closePool()});
