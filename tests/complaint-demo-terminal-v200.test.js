const fs=require('node:fs');
const assert=require('node:assert/strict');

const html=fs.readFileSync('index.html','utf8');

assert.ok(html.includes("if(rec&&rec.status==='完了'){alert('完了済みの苦情は、詳細画面の「理由を入力して再開」から再開してから編集してください。');return}"),
  'completed complaint edit form is not blocked');
assert.ok(html.includes('function reopenComplaintForEdit(idx)'),'reasoned complaint reopen helper missing');
assert.ok(html.includes("let reason=prompt('再開理由を入力してください。"),'complaint reopen reason prompt missing');
assert.ok(html.includes("c.status='対応中'"),'complaint reopen does not restore an editable state');
assert.ok(html.includes("audit('苦情対応再開'"),'complaint reopen is not audited');
assert.ok(html.includes('理由を入力して再開'),'completed complaint detail does not expose the reasoned reopen action');

console.log('complaint-demo-terminal-v200: OK');
