const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function between(start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0,'missing '+start);
  assert.ok(b>a,'missing '+end);
  return source.slice(a,b)
}

test('near-miss edit comparison covers all editable analysis fields',()=>{
  const block=between('let nearBefore=rec?','if(rec&&!nearLines.length)');
  for(const field of ['reportDate','education','locationTags','situationTags','roadTags','targetTags','internalFactors']){
    assert.ok(block.includes(field),field+' missing from change detection')
  }
});

test('failed rollback forces recovery-required save lock',()=>{
  const saveBlock=between('function save(){','let ADMIN_OFFICE_SCOPE=');
  assert.ok(source.includes("const CORE_RECOVERY_REQUIRED_KEY='v197CORE_RECOVERY_REQUIRED'"));
  assert.ok(saveBlock.includes('markCoreRecoveryRequired()'));
  assert.ok(saveBlock.includes('CORE_RECOVERY_REQUIRED'))
});

test('monthly drilldowns reset stale filters and all-period high-risk clears month',()=>{
  const block=between('function resetAccidentListForMonth','function renderSafetyOverview');
  assert.ok(block.includes("q.value=''"));
  assert.ok(block.includes("r.value=''"));
  assert.ok(block.includes("c.value=''"));
  assert.ok(block.includes("NEAR_MONTH=month||''"));
  assert.ok(block.includes("openAllHighRiskNear"));
  assert.ok(block.includes("resetNearListForMonth('')"))
});

test('near-miss monthly targets use persistent snapshots',()=>{
  const block=between('function normalizedEmployeeDate','function nearQuotaStats');
  assert.ok(source.includes("let NEAR_QUOTA_TARGETS=safeStorageRead('v197NEAR_QUOTA_TARGETS',{})||{}"));
  assert.ok(block.includes('buildNearQuotaTargetSnapshot'));
  assert.ok(block.includes('nearQuotaTargetSnapshot'));
  assert.ok(block.includes('nearQuotaSnapshotInScope'))
});

test('historical target state rolls back later transfer/retirement details',()=>{
  const start=source.indexOf('function employeeQuotaStateAtMonthStart');
  const end=source.indexOf('function buildNearQuotaTargetSnapshot',start);
  assert.ok(start>=0&&end>start);
  const fn=source.slice(start,end);
  const context={};
  vm.createContext(context);
  vm.runInContext(fn,context);
  const employee={
    branch:'本社',dept:'総務課',status:'退職',position:'一般',eligibility:'対象外',
    transitionHistory:[{
      date:'2026-09-10',time:'2026-09-10T01:00:00.000Z',
      from:'本社 / タクシー課 / 在籍',to:'本社 / 総務課 / 退職',
      from_position:'乗務員',from_eligibility:'可'
    }]
  };
  const state=context.employeeQuotaStateAtMonthStart(employee,'2026-08');
  assert.equal(state.dept,'タクシー課');
  assert.equal(state.status,'在籍');
  assert.equal(state.position,'乗務員');
  assert.equal(state.eligibility,'可')
});

test('past-month near-miss registration carries quota month context',()=>{
  assert.ok(source.includes("function openNearForm(idx=-1,defaultNo='',quotaMonth='')"));
  assert.ok(source.includes('選択月の不足件数には入りません'));
  const quotaBlock=between('function renderNearQuotaCenterRows',"let NEAR_MONTH=''");
  assert.ok(quotaBlock.includes('openNearForm(-1'));
  assert.ok(quotaBlock.includes('String(month).replaceAll'))
});

test('mobile monthly priority list is capped and category-balanced',()=>{
  const block=between('function safetyMonthlyVisibleItems','function resetAccidentListForMonth');
  assert.ok(block.includes("'(max-width:700px)'"));
  assert.ok(block.includes("?3:8"));
  assert.ok(block.includes("['accident','near','quota']"))
});


test('deadline center excludes inactive credentials and historical document versions',()=>{
  const block=between('function collectDeadlines','function deadlineFilterLabel');
  assert.ok(block.includes("q.status!=='無効'"));
  assert.ok(block.includes("q.status!=='失効'"));
  assert.ok(block.includes("!d.archived"));
  assert.ok(block.includes("!d.replacedByDocumentId"));
  assert.ok(block.includes("d.status!=='差替え済み'"));
  assert.ok(block.includes("d.status!=='無効'"))
});

test('recovery-required key is not evaluated before its declaration',()=>{
  const declaration=source.indexOf("const CORE_RECOVERY_REQUIRED_KEY='v197CORE_RECOVERY_REQUIRED'");
  assert.ok(declaration>=0,'recovery key declaration missing');
  const prefix=source.slice(0,declaration);
  assert.equal(prefix.includes('CORE_RECOVERY_REQUIRED_KEY'),false,'recovery key referenced before initialization');
  assert.ok(source.includes("const SYSTEM_RESTORE_EXTRA_KEYS=['v23E','v45EmployeeDataVersion','v68SCHEMA','v91RESTORED_SOURCE_SCHEMA','v91RESTORED_CORE_SCHEMA','v70LAST_RESTORE','v197CORE_RECOVERY_REQUIRED']"));
});


test('complaint edit comparison covers guidance and all editable response fields',()=>{
  const block=between('let complaintBefore=rec?','if(rec&&!complaintLines.length)');
  for(const field of [
    'responseTime','responder','customerName','occurrenceDate','occurrenceTime',
    'guidanceContent','instructor','guidanceDate','guidanceTime','ownerId'
  ]){
    assert.ok(block.includes(field),field+' missing from complaint change detection')
  }
  assert.ok(block.includes("guidanceContent:'指導内容'"));
});


test('form save guard blocks stale or recovery-required state before form mutation handlers run',()=>{
  const block=between("fsave.addEventListener('click',e=>{","window.addEventListener('storage'");
  const guard=block.indexOf('if(!coreSaveRevisionIsCurrent())');
  const attempt=block.indexOf('FORM_SAVE_ATTEMPT=true');
  assert.ok(guard>=0,'missing pre-mutation save guard');
  assert.ok(attempt>guard,'save guard must run before form save attempt and onclick mutation');
  assert.ok(block.includes('e.stopImmediatePropagation()'));
  assert.ok(block.includes('save();'));
});


test('failed or rejected core saves restore the last good in-memory state',()=>{
  const saveBlock=between('let CORE_LAST_GOOD_MEMORY=null;','function coreMutationReady()');
  assert.ok(saveBlock.includes('function captureCoreMemorySnapshot()'));
  assert.ok(saveBlock.includes('function restoreCoreMemorySnapshot(snapshot)'));
  assert.ok(saveBlock.includes('function rememberCoreMemoryAsGood()'));
  assert.ok(saveBlock.includes('function restoreLastGoodCoreMemory()'));
  assert.ok(saveBlock.includes('if(!coreSaveRevisionIsCurrent()){\n  restoreLastGoodCoreMemory();'));
  assert.ok(saveBlock.includes('let memoryRollbackFailed=restoreLastGoodCoreMemory();'));
  assert.ok(saveBlock.includes('rememberCoreMemoryAsGood();\n  return true'));
  assert.ok(source.includes('runBootMigrations();\nrememberCoreMemoryAsGood();'));
});

test('memory rollback mutates core arrays in place instead of replacing shared references',()=>{
  const block=between('function restoreCoreMemorySnapshot(snapshot){','function rememberCoreMemoryAsGood()');
  assert.ok(block.includes('target.splice(0,target.length,...value)'));
  assert.ok(block.includes('Object.keys(target).forEach(k=>delete target[k])'));
  assert.ok(block.includes('Object.assign(target,value)'));
});
