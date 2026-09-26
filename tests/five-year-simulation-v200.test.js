const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sim=fs.readFileSync(path.join(__dirname,'..','scripts','simulate-five-years-v200.js'),'utf8');
const doc=fs.readFileSync(path.join(__dirname,'..','docs','FIVE_YEAR_SIMULATION_V200.md'),'utf8');

test('five-year simulator is fictional-only and refuses production/nonempty DB',()=>{
  assert.ok(sim.includes("five-year simulation is forbidden in production"));
  assert.ok(sim.includes("TSUBAME_FIVE_YEAR_SIMULATION!=='1'"));
  assert.ok(sim.includes("five-year simulation requires an empty dedicated database"));
  assert.ok(sim.includes("fictional_only:true"));
});

test('five-year standard workload matches agreed operating scale',()=>{
  assert.ok(sim.includes('initialEmployees:310'));
  assert.ok(sim.includes('annualHires:50'));
  assert.ok(sim.includes('annualRetirements:30'));
  assert.ok(sim.includes('monthlyNearMisses:400'));
  assert.ok(sim.includes('monthlyAccidents:20'));
  assert.ok(sim.includes('years:5'));
  assert.match(doc,/ヒヤリ: 24,000件/);
  assert.match(doc,/事故: 1,200件/);
  assert.match(doc,/現役: 410/);
  assert.match(doc,/退職履歴: 150/);
});

test('five-year simulation verifies history and selected-user authorization invariants',()=>{
  assert.ok(sim.includes('no_self_users:selfUsers===0'));
  assert.ok(sim.includes('no_missing_snapshots:badSnapshots===0'));
  assert.ok(sim.includes('historical_snapshot_survives_transfer:historicalSnapshotRetained>0'));
  assert.ok(sim.includes('no_duplicate_current_employee_numbers:duplicateCurrent===0'));
  assert.ok(sim.includes('permission_rows_present:counts.user_feature_permissions>0'));
  assert.ok(sim.includes('employee_number_history'));
});

test('five-year simulation records representative query timings with a broad audit ceiling',()=>{
  assert.ok(sim.includes("timed('employee_number_lookup'"));
  assert.ok(sim.includes("timed('latest_near_misses'"));
  assert.ok(sim.includes("timed('monthly_safety_aggregate'"));
  assert.ok(sim.includes("timed('scope_filtered_accidents'"));
  assert.ok(sim.includes('representative_queries_under_5s'));
});

test('five-year audit combines normal operation with failure scenarios',()=>{
  for(const term of ['VERSION_CONFLICT','scanner timeout','storage 404','backup欠損','権限縮小後のsession失効','社外IPアクセス拒否','DB dump/restore']){
    assert.ok(doc.includes(term),term)
  }
});
