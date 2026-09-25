const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const store=fs.readFileSync(path.join(__dirname,'..','api','_lib','work-import-store.js'),'utf8');
const commit=fs.readFileSync(path.join(__dirname,'..','api','v1','work-import','commit.js'),'utf8');
const history=fs.readFileSync(path.join(__dirname,'..','api','v1','work-import','history.js'),'utf8');
const rollback=fs.readFileSync(path.join(__dirname,'..','api','v1','work-import','[id]','rollback.js'),'utf8');
const router=fs.readFileSync(path.join(__dirname,'..','api','router.js'),'utf8');

test('work import commit revalidates preflight hash and uses transactional store',()=>{
  assert.ok(commit.includes('PREFLIGHT_HASH_REQUIRED'));
  assert.ok(commit.includes('PREFLIGHT_FILE_CHANGED'));
  assert.ok(commit.includes('parseWorkbookBuffer(requestBuffer(req),fileName,{includeRows:true})'));
  assert.ok(commit.includes('commitWorkImport'));
  assert.ok(store.includes('pg_advisory_xact_lock'));
  assert.ok(store.includes('IMPORT_ALREADY_COMMITTED'));
});

test('work import resolves current and historical employee numbers without guessing ambiguity',()=>{
  assert.ok(store.includes('employee_number_history'));
  assert.ok(store.includes('EMPLOYEE_NUMBER_NOT_FOUND'));
  assert.ok(store.includes('EMPLOYEE_NUMBER_AMBIGUOUS'));
});

test('work import rollback refuses to overwrite later batch changes',()=>{
  assert.ok(store.includes('ROLLBACK_CONFLICT'));
  assert.ok(store.includes("String(current.source_batch_id||'')!==String(batchId)"));
  assert.ok(store.includes("status='rolled_back'"));
  assert.ok(rollback.includes('rollbackWorkImport'));
});

test('work import routes include preflight commit history and rollback',()=>{
  for(const token of ['api/v1/work-import/preflight.js','api/v1/work-import/commit.js','api/v1/work-import/history.js','api/v1/work-import/[id]/rollback.js'])assert.ok(router.includes(token));
  assert.ok(history.includes('listWorkImports'));
});
