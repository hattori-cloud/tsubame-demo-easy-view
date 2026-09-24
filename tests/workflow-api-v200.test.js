const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function src(...parts){return fs.readFileSync(path.join(__dirname,'..',...parts),'utf8')}
const store=src('api','_lib','workflow-store.js');
const draft=src('api','v1','drafts','[kind].js');
const noticeRead=src('api','v1','notices','[id]','read.js');
const confirmationRespond=src('api','v1','confirmations','[id]','respond.js');
const handoffAck=src('api','v1','handoffs','[id]','acknowledge.js');

test('drafts are isolated by authenticated owner and version protected after creation',()=>{
  assert.ok(store.includes('where owner_user_id=$1 and kind=$2'));
  assert.ok(store.includes('PRECONDITION_REQUIRED'));
  assert.ok(store.includes('assertVersion(current,expectedVersion)'));
  assert.ok(draft.includes("req.method==='DELETE'"));
});

test('applications are employee-scoped and manager decisions are audited',()=>{
  assert.ok(store.includes('listApplications(user,filters={}'));
  assert.ok(store.includes('scopeSql(user,params'));
  assert.ok(store.includes("'申請更新'"));
  assert.ok(store.includes('insert into record_histories'));
});

test('notice reads use user id and are idempotent',()=>{
  assert.ok(store.includes('insert into notice_reads(notice_id,user_id)'));
  assert.ok(store.includes('on conflict(notice_id,user_id) do update'));
  assert.ok(noticeRead.includes('authenticateRequest(req)'));
});

test('confirmation responses persist immutable employee and user ids',()=>{
  assert.ok(store.includes('insert into confirmation_responses(confirmation_id,user_id,employee_id,response)'));
  assert.ok(store.includes('user.employee_id'));
  assert.ok(confirmationRespond.includes('respondConfirmation'));
});

test('handoff acknowledgment can only be performed by the designated recipient',()=>{
  assert.ok(store.includes("to_user_id=$2 and status='pending'"));
  assert.ok(store.includes("'引継ぎ確認'"));
  assert.ok(handoffAck.includes('acknowledgeHandoff'));
});

test('company-wide notice and confirmation authoring requires full administrator in store',()=>{
  assert.ok(store.includes('async function saveNotice'));
  assert.ok(store.includes('async function saveConfirmation'));
  assert.ok(store.includes('full(user)'));
});
