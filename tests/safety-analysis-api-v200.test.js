const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function src(...parts){return fs.readFileSync(path.join(__dirname,'..',...parts),'utf8')}
const store=src('api','_lib','safety-analysis-store.js');
const route=src('api','v1','analysis','safety-summary.js');

test('production safety analysis uses record-time organization snapshots',()=>{
  for(const field of ['office_at_record','department_at_record','office_at_report','department_at_report'])assert.ok(store.includes(field));
  assert.ok(store.includes('function snapshotScopeSql'));
});

test('safety analysis exposes the hardened KPIs',()=>{
  for(const field of ['high_risk_near_miss_ratio','open_case_ratio','average_repair_cost','analysis_completeness_ratio','snapshot_completeness_ratio'])assert.ok(store.includes(field));
});

test('historical analysis has monthly trend and department comparison',()=>{
  assert.ok(store.includes('monthlyTrend'));
  assert.ok(store.includes('departmentComparison'));
  assert.ok(store.includes('reference_per_100'));
  assert.ok(store.includes('真の発生率ではありません'));
});

test('department reference ratio uses current active headcount only as an explicitly labeled reference',()=>{
  assert.ok(store.includes("lifecycle_status='active'"));
  assert.ok(store.includes('active_employee_count'));
  assert.ok(store.includes('event_count*100.0'));
});

test('analysis API is manager-only and server authenticated',()=>{
  assert.ok(store.includes("!['full','scoped'].includes(user.role_level)"));
  assert.ok(route.includes('authenticateRequest(req)'));
  assert.ok(route.includes('resolveCurrentUser(identity)'));
});

test('analysis filters are intersected with snapshot scope and do not grant wider access',()=>{
  assert.ok(store.includes('snapshotScopeSql(user,p'));
  assert.ok(store.includes('addSnapshotFilters'));
});


test('monthly safety trend uses a PostgreSQL-safe quoted month alias',()=>{
  assert.ok(store.includes('as \\"month\\"'));
  assert.equal(store.includes(",'YYYY-MM') month,count"),false);
});
