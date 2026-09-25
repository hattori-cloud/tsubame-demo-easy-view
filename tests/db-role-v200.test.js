const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const grants=fs.readFileSync(path.join(__dirname,'..','docs','production-runtime-grants-v200.sql'),'utf8');

test('runtime grants keep application role non-DDL and audit append-only',()=>{
  assert.match(grants,/revoke create on schema public from public/i);
  assert.match(grants,/revoke all privileges on all tables in schema public from tsubame_app/i);
  assert.match(grants,/grant usage on schema public to tsubame_app/i);
  assert.match(grants,/grant insert on[\s\S]*employee_number_history,[\s\S]*record_histories,[\s\S]*audit_logs[\s\S]*to tsubame_app/i);
  assert.doesNotMatch(grants,/grant\s+update[\s\S]*audit_logs/i);
  assert.doesNotMatch(grants,/grant\s+delete[\s\S]*audit_logs/i);
  assert.match(grants,/grant delete on[\s\S]*user_scopes,[\s\S]*drafts[\s\S]*to tsubame_app/i);
});
