const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function src(...parts){return fs.readFileSync(path.join(__dirname,'..',...parts),'utf8')}
const capacity=src('docs','production-capacity-v189.sql');
const store=src('api','_lib','near-miss-compliance-store.js');
const snapshotRoute=src('api','v1','near-miss-compliance','snapshot.js');
const targetRoute=src('api','v1','near-miss-compliance','targets','[id].js');

test('monthly near-miss targets are versioned and retain immutable employee snapshots',()=>{
  assert.match(capacity,/employee_no_snapshot text not null/i);
  assert.match(capacity,/office_snapshot text not null/i);
  assert.match(capacity,/department_snapshot text not null/i);
  assert.match(capacity,/updated_by_user_id uuid references users\(id\)/i);
  assert.match(capacity,/version integer not null default 1/i);
});

test('monthly snapshot is created explicitly once and defaults each taxi driver to two reports',()=>{
  assert.ok(store.includes('MONTHLY_TARGET_ALREADY_EXISTS'));
  assert.ok(store.includes("e.department like 'タクシー%'"));
  assert.ok(store.includes("coalesce(e.position,'')='乗務員'"));
  assert.ok(store.includes("2,'required'"));
  assert.ok(store.includes("'ヒヤリ月次対象確定'"));
});

test('monthly compliance scope uses the frozen office and department snapshots',()=>{
  assert.ok(store.includes('office_snapshot'));
  assert.ok(store.includes('department_snapshot'));
  assert.ok(store.includes('function snapshotScopeSql'));
  assert.ok(store.includes('near_miss_monthly_compliance c'));
});

test('compliance summary distinguishes zero short met and exempt drivers',()=>{
  for(const field of ['target_driver_count','met_count','short_count','zero_count','exempt_count','required_report_total','submitted_report_total']){
    assert.ok(store.includes(field),field+' missing from summary');
  }
  assert.ok(store.includes("case c.compliance_state when 'zero' then 0 when 'short' then 1"));
});

test('exceptions are explicit and exemption reason is mandatory',()=>{
  assert.ok(store.includes('EXEMPTION_REASON_REQUIRED'));
  assert.ok(store.includes("['required','exempt'].includes(state)"));
  assert.ok(store.includes('exemption_reason'));
  assert.ok(store.includes("'target_change'"));
});

test('monthly target changes are full-admin MFA version-protected actions',()=>{
  assert.ok(snapshotRoute.includes("user.role_level!=='full'||!identity.mfa"));
  assert.ok(targetRoute.includes("user.role_level!=='full'||!identity.mfa"));
  assert.ok(targetRoute.includes('parseIfMatchHeader'));
  assert.ok(store.includes('VERSION_CONFLICT'));
});
