const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function src(...parts){return fs.readFileSync(path.join(__dirname,'..',...parts),'utf8')}
const store=src('api','_lib','employee-store.js');
const listRoute=src('api','v1','employees','index.js');
const detailRoute=src('api','v1','employees','[id].js');

test('employee creation rejects current and historical employee number reuse',()=>{
  assert.ok(store.includes("select id from employees where employee_no=$1"));
  assert.ok(store.includes("select employee_id from employee_number_history where old_employee_no=$1"));
  assert.ok(store.includes("EMPLOYEE_NO_ALREADY_USED"));
});

test('general employee patch cannot change employee number assignment or lifecycle',()=>{
  assert.ok(store.includes("USE_RENUMBER_ENDPOINT"));
  assert.ok(store.includes("USE_TRANSITION_ENDPOINT"));
  assert.ok(store.includes("['office','department','lifecycle_status','retired_on']"));
});

test('safety decision fields require explicit authority for scoped managers',()=>{
  assert.ok(store.includes("safetyKeys=['safety_state','eligibility']"));
  assert.ok(store.includes('SAFETY_AUTHORITY_REQUIRED'));
});

test('employee profile updates are versioned and atomically audited',()=>{
  assert.ok(store.includes("action,before_data,after_data"));
  assert.ok(store.includes("'profile_update'"));
  assert.ok(store.includes("'社員情報更新'"));
  assert.ok(store.includes('version=version+1'));
});

test('production employee routes support POST and PATCH while fixture mode remains read-only',()=>{
  assert.ok(listRoute.includes("req.method==='POST'"));
  assert.ok(detailRoute.includes("req.method==='PATCH'"));
  assert.ok(listRoute.includes('FIXTURES_READ_ONLY'));
  assert.ok(detailRoute.includes('FIXTURES_READ_ONLY'));
  assert.ok(detailRoute.includes('parseIfMatchHeader'));
});

test('employee creation requires full administrator MFA',()=>{
  assert.ok(listRoute.includes("user.role_level!=='full'||!identity.mfa"));
  assert.ok(listRoute.includes('FULL_ADMIN_MFA_REQUIRED'));
});
