const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const contract=fs.readFileSync(path.join(__dirname,'..','docs','api-contract.md'),'utf8');

test('user management presents account lifecycle as one operational flow',()=>{
  assert.ok(html.includes('利用者・ログイン・権限設定（全社管理者専用）'));
  assert.ok(html.includes('ログインID・社員番号・氏名・担当範囲で検索'));
  assert.ok(html.includes('function userAccountNextAction(u)'));
  assert.ok(html.includes('退職連動：本番では即時停止＋全セッション失効'));
  assert.ok(html.includes('アカウント発行'));
  assert.ok(html.includes('パスワードリセット'));
  assert.ok(html.includes('停止操作と同時に全セッションを失効'));
});

test('production API contract couples retirement and account suspension',()=>{
  assert.match(contract,/POST \/api\/v1\/users\/\{id\}\/suspend/);
  assert.match(contract,/invalidates \*\*all active sessions in the same logical operation\*\*/);
  assert.match(contract,/POST \/api\/v1\/users\/\{id\}\/reactivate/);
  assert.match(contract,/PATCH \/api\/v1\/users\/\{id\}\/access/);
  assert.match(contract,/When an employee transition is committed to `retired`/);
  assert.match(contract,/The operator must not need a second manual "disable login" step after retirement/);
});

test('renumbered employee sessions stay bound to immutable identity',()=>{
  assert.match(contract,/existing authenticated sessions remain tied to immutable user\/employee IDs/);
  assert.match(contract,/must never become attached to another employee/);
});


test('session issuance rechecks active account and employee lifecycle at commit time',()=>{
  const authStore=fs.readFileSync(path.join(__dirname,'..','api','_lib','auth-store.js'),'utf8');
  const login=fs.readFileSync(path.join(__dirname,'..','api','v1','auth','login.js'),'utf8');
  const verify=fs.readFileSync(path.join(__dirname,'..','api','v1','auth','mfa','verify.js'),'utf8');
  const enroll=fs.readFileSync(path.join(__dirname,'..','api','v1','auth','mfa','enroll','complete.js'),'utf8');
  assert.ok(authStore.includes("u.state='active'"));
  assert.ok(authStore.includes("e.lifecycle_status<>'retired'"));
  assert.ok(authStore.includes('return r.rows[0]||null'));
  for(const source of [login,verify,enroll])assert.ok(source.includes('SESSION_NOT_ALLOWED'));
});

test('retirement invalidates pending credentials and records account suspension audit',()=>{
  const store=fs.readFileSync(path.join(__dirname,'..','api','_lib','employee-store.js'),'utf8');
  assert.ok(store.includes('update mfa_challenges set verified_at=now()'));
  assert.ok(store.includes('update password_reset_tokens set used_at=now()'));
  assert.ok(store.includes("'retirement_auto_suspend'"));
  assert.ok(store.includes("'退職連動利用者停止'"));
  assert.ok(store.includes("revoke_reason='employee_retired'"));
});
