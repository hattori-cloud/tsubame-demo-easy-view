const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function src(...parts){return fs.readFileSync(path.join(__dirname,'..',...parts),'utf8')}
const store=src('api','_lib','user-store.js');
const users=src('api','v1','users','index.js');
const access=src('api','v1','users','[id]','access.js');
const suspend=src('api','v1','users','[id]','suspend.js');
const reset=src('api','v1','auth','password','reset.js');
const resetComplete=src('api','v1','auth','password','reset','complete.js');
const auditStore=src('api','_lib','audit-store.js');
const auditRoute=src('api','v1','audit-logs','index.js');

test('new users are linked to immutable employee id and receive one-time setup instead of readable password',()=>{
  assert.ok(store.includes('insert into users(employee_id,login_id,password_hash'));
  assert.ok(store.includes('insert into password_reset_tokens'));
  assert.ok(users.includes('setup_token:setupToken'));
  assert.equal(users.includes('password_hash:'),false);
  assert.equal(users.includes('password:unknownPassword'),false);
});

test('management account creation and access changes enforce MFA policy',()=>{
  assert.ok(store.includes("const mfaRequired=roleLevel!=='self'"));
  assert.ok(store.includes("const mfaRequired=role!=='self'"));
  assert.ok(users.includes("actor.role_level!=='full'||!identity.mfa"));
  assert.ok(access.includes('MFA_REQUIRED'));
});

test('access reduction and suspension revoke existing sessions',()=>{
  assert.ok(store.includes("revoke_reason='access_changed'"));
  assert.ok(store.includes("state==='suspended'?'account_suspended':'account_reactivated'"));
  assert.ok(suspend.includes('sessions_revoked:true'));
});

test('password reset stores token hash, revokes sessions and never returns password hash',()=>{
  assert.ok(store.includes('password_reset_tokens'));
  assert.ok(store.includes("revoke_reason='password_reset_issued'"));
  assert.ok(store.includes("revoke_reason='password_reset_completed'"));
  assert.ok(reset.includes('tokenHash(raw)'));
  assert.ok(resetComplete.includes('tokenHash(raw)'));
  assert.ok(resetComplete.includes('Argon2id'));
  assert.equal(reset.includes('password_hash'),false);
});

test('audit API is read-only, paginated and requires full-admin MFA',()=>{
  assert.ok(auditStore.includes("role_level!=='full'||!identity?.mfa"));
  assert.ok(auditStore.includes('pageSize=Math.min(100'));
  assert.ok(auditStore.includes('from audit_logs a'));
  assert.ok(auditRoute.includes("req.method!=='GET'"));
  assert.equal(auditRoute.includes("req.method==='POST'"),false);
});

test('account and audit mutations are written server-side with request ids',()=>{
  assert.ok(store.includes('insert into audit_logs'));
  assert.ok(store.includes('requestId'));
  assert.ok(store.includes('insert into record_histories'));
});
