const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sql=fs.readFileSync(path.join(__dirname,'..','docs','production-schema.sql'),'utf8');
const api=fs.readFileSync(path.join(__dirname,'..','docs','api-contract.md'),'utf8');

test('near-miss schema records all intake sources',()=>{
  assert.match(sql,/source_type text not null default 'system'/);
  assert.match(sql,/source_type in \('system','paper','google_form'\)/);
  assert.match(sql,/source_ref text/);
  assert.match(sql,/source_submitted_at timestamptz/);
  assert.match(sql,/imported_at timestamptz/);
});

test('Google Form response reference is duplicate-safe in database',()=>{
  assert.match(sql,/create unique index near_misses_google_form_source_ref_uidx on near_misses \(source_ref\)/);
  assert.match(sql,/where source_type = 'google_form' and source_ref is not null/);
});

test('API contract keeps three intake paths in one canonical near-miss ledger',()=>{
  assert.match(api,/system.*entered directly/i);
  assert.match(api,/paper.*transcribed/i);
  assert.match(api,/google_form.*imported automatically/i);
  assert.match(api,/monthly two-report quota counts valid records from all three sources together/i);
});

test('Google Form import contract requires idempotency and error-only admin attention',()=>{
  assert.match(api,/integrations\/google-form\/near-misses\/import/);
  assert.match(api,/Idempotency requirements/);
  assert.match(api,/取込エラー N件/);
  assert.match(api,/successful imports require no manual transcription/i);
  assert.match(api,/server-side configuration only/i);
});
