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
