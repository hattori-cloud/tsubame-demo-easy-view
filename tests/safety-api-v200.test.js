const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const store=fs.readFileSync(path.join(__dirname,'..','api','_lib','safety-store.js'),'utf8');
function src(...parts){return fs.readFileSync(path.join(__dirname,'..',...parts),'utf8')}

test('safety create paths derive historical organization snapshots from server employee rows',()=>{
  assert.ok(store.includes('e.office,e.department,e.employment_type||null'));
  assert.ok(store.includes('e.employee_no,e.office,e.department,e.employment_type||null'));
  assert.ok(store.includes('employeeSnapshotForUser'));
});

test('normal safety edits do not allow reassignment or rewriting historical snapshots',()=>{
  const accidentAllowed=store.match(/updateAccident[\s\S]*?editablePatch\(body,\[([^\]]+)\]/);
  assert.ok(accidentAllowed);
  assert.equal(accidentAllowed[1].includes('employee_id'),false);
  assert.equal(accidentAllowed[1].includes('office_at_record'),false);
  const nearAllowed=store.match(/updateNearMiss[\s\S]*?editablePatch\(body,\[([^\]]+)\]/);
  assert.ok(nearAllowed);
  assert.equal(nearAllowed[1].includes('employee_no_at_report'),false);
  assert.equal(nearAllowed[1].includes('department_at_report'),false);
  const complaintAllowed=store.match(/updateComplaint[\s\S]*?editablePatch\(body,\[([^\]]+)\]/);
  assert.ok(complaintAllowed);
  assert.equal(complaintAllowed[1].includes('employee_id'),false);
  assert.equal(complaintAllowed[1].includes('office_at_record'),false);
});

test('safety list search resolves historical employee numbers without changing stored snapshots',()=>{
  assert.ok(store.includes('employee_number_history h'));
  assert.ok(store.includes('h.old_employee_no ilike'));
});

test('safety updates use version conflicts, record histories and audit rows atomically',()=>{
  assert.ok(store.includes("VERSION_CONFLICT"));
  assert.ok(store.includes('withTransaction(async client=>'));
  assert.ok(store.includes('insert into record_histories'));
  assert.ok(store.includes('insert into audit_logs'));
});

test('accident and complaint completion are server validated',()=>{
  assert.ok(store.includes('原因・再発防止・対応履歴を入力してから完了してください'));
  assert.ok(store.includes('指導内容・対応内容を確認してから完了してください'));
  assert.ok(store.includes("phase='completed'"));
  assert.ok(store.includes("status='completed'"));
});

test('archive routes are POST actions and there is no normal DELETE path',()=>{
  const routes=[
    src('api','v1','accidents','[id]','archive.js'),
    src('api','v1','near-misses','[id]','archive.js'),
    src('api','v1','complaints','[id]','archive.js')
  ];
  routes.forEach(route=>{assert.ok(route.includes("req.method!=='POST'"));assert.equal(route.includes("req.method==='DELETE'"),false)});
});

test('main safety routes require authenticated server-resolved user',()=>{
  for(const p of [
    ['api','v1','accidents','index.js'],
    ['api','v1','near-misses','index.js'],
    ['api','v1','complaints','index.js']
  ]){
    const route=src(...p);
    assert.ok(route.includes('authenticateRequest(req)'));
    assert.ok(route.includes('resolveCurrentUser(identity)'));
  }
});


test('accident and complaint owners must be active managers authorized for the employee',()=>{
  assert.ok(store.includes('managerAssigneeForEmployee'));
  assert.ok(store.includes('OWNER_USER_NOT_AUTHORIZED'));
  assert.ok(store.includes("u.role_level in ('full','scoped')"));
  assert.ok(store.includes("exists("));
  assert.ok(store.includes('user_scopes'));
});


test('accident and complaint reads are manager-only at the server layer',()=>{
  const accidentList=store.slice(store.indexOf('async function listAccidents'),store.indexOf('async function getAccident'));
  const accidentGet=store.slice(store.indexOf('async function getAccident'),store.indexOf('async function createAccident'));
  const complaintList=store.slice(store.indexOf('async function listComplaints'),store.indexOf('async function getComplaint'));
  const complaintGet=store.slice(store.indexOf('async function getComplaint'),store.indexOf('async function createComplaint'));
  assert.ok(accidentList.includes('requireSafetyManager(user)'));
  assert.ok(accidentGet.includes('requireSafetyManager(user)'));
  assert.ok(complaintList.includes('requireSafetyManager(user)'));
  assert.ok(complaintGet.includes('requireSafetyManager(user)'));
});

test('complaint detail route supports authorized GET and versioned PATCH',()=>{
  const route=src('api','v1','complaints','[id].js');
  assert.ok(route.includes("req.method==='GET'"));
  assert.ok(route.includes("req.method==='PATCH'"));
  assert.ok(route.includes('getComplaint(user,id)'));
  assert.ok(route.includes('parseIfMatchHeader'));
});

test('safety mutations lock the record row before version comparison',()=>{
  assert.ok(store.includes("forUpdate?' for update of r':''"));
  for(const kind of ['accidents','near_misses','complaints']){
    assert.ok(store.includes("scopedRecord(user,'"+kind+"',id,client,{forUpdate:true});assertVersion"));
  }
});

test('normal accident and complaint updates cannot bypass complete or reopen workflow',()=>{
  const accidentUpdate=store.slice(store.indexOf('async function updateAccident'),store.indexOf('async function completeAccident'));
  const complaintUpdate=store.slice(store.indexOf('async function updateComplaint'),store.indexOf('async function completeComplaint'));
  assert.ok(accidentUpdate.includes('REOPEN_REQUIRED'));
  assert.ok(accidentUpdate.includes('USE_COMPLETION_ENDPOINT'));
  const accidentAllowed=accidentUpdate.match(/editablePatch\(body,\[([^\]]+)\]/);
  assert.ok(accidentAllowed);assert.equal(accidentAllowed[1].includes("'phase'"),false);
  assert.ok(complaintUpdate.includes('REOPEN_REQUIRED'));
  assert.ok(complaintUpdate.includes('USE_COMPLETION_ENDPOINT'));
  const complaintAllowed=complaintUpdate.match(/editablePatch\(body,\[([^\]]+)\]/);
  assert.ok(complaintAllowed);assert.equal(complaintAllowed[1].includes("'status'"),false);
});
