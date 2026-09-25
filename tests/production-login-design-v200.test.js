const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const contract=fs.readFileSync(path.join(__dirname,'..','docs','api-contract.md'),'utf8');

test('production login design is ID plus current employee number plus password',()=>{
  assert.ok(html.includes("provider:'ログインID＋社員番号＋パスワード'"));
  assert.ok(html.includes('<b>ID</b>'));
  assert.ok(html.includes('<b>社員番号</b>'));
  assert.ok(html.includes('<b>パスワード</b>'));
  assert.ok(html.includes('旧社員番号ではログインできません'));
  assert.ok(html.includes('ID・パスワード・裏側の固定社員IDはそのままです'));
});

test('login API contract protects password and employee renumbering semantics',()=>{
  assert.match(contract,/POST \/api\/v1\/auth\/login/);
  assert.match(contract,/"login_id": "ADM-01"/);
  assert.match(contract,/"employee_no": "1002"/);
  assert.match(contract,/Argon2id/);
  assert.match(contract,/never an old number from `employee_number_history`/);
  assert.match(contract,/Login failures return a generic authentication error/);
  assert.match(contract,/passwords and password hashes are never written to audit logs/);
  assert.match(contract,/the next login uses the \*\*new current employee number\*\*/);
});


test('login failures share a minimum response delay to reduce account-state timing leakage',()=>{
  const login=fs.readFileSync(path.join(__dirname,'..','api','v1','auth','login.js'),'utf8');
  assert.ok(login.includes('async function delayedAuthFailure'));
  assert.ok(login.includes('180-(Date.now()-startedAt)'));
  assert.ok(login.includes('if(!account){'));
  assert.ok(login.includes('recordNetworkLoginFailure(rateKeys)'));
  assert.ok(login.includes('return delayedAuthFailure(res,id,authStartedAt)'));
});
