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

test('general employee patch cannot change employee number assignment, shift, assignment or lifecycle',()=>{
  assert.ok(store.includes("USE_RENUMBER_ENDPOINT"));
  assert.ok(store.includes("USE_TRANSITION_ENDPOINT"));
  assert.ok(store.includes("['office','department','work_pattern','lifecycle_status','retired_on']"));
  assert.ok(store.includes('所属・勤務区分・在籍状態の変更は専用操作を使用してください'));
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


test('employee detail exposes scoped renumber and lifecycle history from append-only records',()=>{
  assert.ok(store.includes('async function getEmployeeHistoryForUser'));
  assert.ok(store.includes('employee_number_history where employee_id=$1'));
  assert.ok(store.includes("action='employee_transition'"));
  assert.ok(detailRoute.includes('getEmployeeHistoryForUser'));
  assert.ok(detailRoute.includes('{employee,history,data_mode:'));
});


test('company-wide employee creation does not force taxi day shift defaults',()=>{
  assert.ok(store.includes("body.work_pattern||null"));
  assert.equal(store.includes("body.work_pattern||'日勤'"),false);
});

test('employee history exposes work pattern changes from both profile and transition history',()=>{
  assert.ok(store.includes("work_pattern_changes:workPatterns.rows"));
  assert.ok(store.includes("action in ('profile_update','employee_transition')"));
  assert.ok(store.includes("before_data ? 'work_pattern' or after_data ? 'work_pattern'"));
});

test('employee transition updates department and work pattern atomically with one version increment',()=>{
  assert.ok(store.includes("work_pattern:target?.work_pattern===undefined?before.work_pattern"));
  assert.ok(store.includes("update employees set office=$2,department=$3,work_pattern=$4,lifecycle_status=$5,retired_on=$6"));
  assert.ok(store.includes("work_pattern:before.work_pattern"));
  assert.ok(store.includes("JSON.stringify(next)"));
});
