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


assert.ok(html.includes('function complaintCompletionMissingFields(data)'),
  'complaint completion parity helper missing');
assert.ok(html.includes("missing.push('クレームランク')"),
  'complaint completion does not require rank');
assert.ok(html.includes("missing.push('指導内容')"),
  'complaint completion does not require guidance content');
assert.ok(html.includes("missing.push('次回対応内容')"),
  'complaint completion does not require next action');
assert.ok(html.includes('if(!validateComplaintCompletion(data))return;'),
  'complaint save path does not enforce shared completion validation');

assert.ok(html.includes('@media(max-width:360px)'),
  'narrow viewport modal guard missing');
assert.ok(html.includes('.modal{width:100%;max-width:100vw;min-width:0;overflow-x:hidden}'),
  'narrow modal can still exceed viewport width');
assert.ok(html.includes('.mhead{min-width:0;max-width:100%;gap:8px;flex-wrap:wrap}'),
  'narrow modal header does not wrap');
assert.ok(html.includes('.mhead h2{min-width:0;max-width:100%;flex:1 1 180px;overflow-wrap:anywhere;word-break:break-word}'),
  'narrow modal title can still force horizontal overflow');
