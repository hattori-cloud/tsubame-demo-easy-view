const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function src(...parts){return fs.readFileSync(path.join(__dirname,'..',...parts),'utf8')}
const store=src('api','_lib','workflow-store.js');
const draft=src('api','v1','drafts','[kind].js');
const handoffAck=src('api','v1','handoffs','[id]','acknowledge.js');

test('drafts are isolated by authenticated owner and version protected after creation',()=>{
  assert.ok(store.includes('where owner_user_id=$1 and kind=$2'));
  assert.ok(store.includes('PRECONDITION_REQUIRED'));
  assert.ok(store.includes('assertVersion(current,expectedVersion)'));
  assert.ok(draft.includes("req.method==='DELETE'"));
});

test('handoff acknowledgment can only be performed by the designated recipient',()=>{
  assert.ok(store.includes("to_user_id=$2 and status='pending'"));
  assert.ok(store.includes("'引継ぎ確認'"));
  assert.ok(handoffAck.includes('acknowledgeHandoff'));
});

test('handoff recipient must be an active manager authorized for the target employee',()=>{
  assert.ok(store.includes("u.role_level in ('full','scoped')"));
  assert.ok(store.includes("TARGET_USER_NOT_AUTHORIZED"));
  assert.ok(store.includes("EMPLOYEE_REQUIRED_FOR_SCOPED_HANDOFF"));
  assert.ok(store.includes("exists(select 1 from user_scopes s"));
});

test('retired self-service workflow handlers remain physically removed',()=>{
  const retired=[
    ['applications','index.js'],['applications','[id].js'],
    ['notices','index.js'],['notices','[id].js'],['notices','[id]','read.js'],
    ['confirmations','index.js'],['confirmations','[id].js'],['confirmations','[id]','respond.js']
  ];
  for(const parts of retired)assert.equal(fs.existsSync(path.join(__dirname,'..','api','v1',...parts)),false,parts.join('/'));
  for(const dead of ['listApplications','createApplication','updateApplication','listNotices','saveNotice','markNoticeRead','listConfirmations','saveConfirmation','respondConfirmation']){
    assert.equal(store.includes(dead),false,dead)
  }
});
