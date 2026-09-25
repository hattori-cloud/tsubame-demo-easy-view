const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const preflight=fs.readFileSync(path.join(__dirname,'..','api','v1','work-import','preflight.js'),'utf8');
const store=fs.readFileSync(path.join(__dirname,'..','api','_lib','work-import-store.js'),'utf8');
const router=fs.readFileSync(path.join(__dirname,'..','api','router.js'),'utf8');
const sql=fs.readFileSync(path.join(__dirname,'..','docs','production-work-import-v200.sql'),'utf8');
const commit=fs.readFileSync(path.join(__dirname,'..','api','v1','work-import','batches','[id]','commit.js'),'utf8');
const rollback=fs.readFileSync(path.join(__dirname,'..','api','v1','work-import','batches','[id]','rollback.js'),'utf8');

test('work import preflight persists only normalized rows when DB is configured',()=>{
  assert.ok(preflight.includes("Object.defineProperty(result,'_rows'"));
  assert.ok(preflight.includes('createWorkImportPreflight'));
  assert.ok(preflight.includes("persistence:batch?'preflight-batch':'none'"));
  assert.ok(preflight.includes("data_mode:batch?'preflight-and-confirm':'preflight-only'"));
});

test('work import schema separates batch, rows and monthly business data',()=>{
  assert.match(sql,/create table if not exists work_import_batches/i);
  assert.match(sql,/create table if not exists work_import_rows/i);
  assert.match(sql,/create table if not exists work_summary_monthly/i);
  assert.match(sql,/unique \(employee_id, month_start\)/i);
  assert.doesNotMatch(sql,/file_blob|xlsx_blob|original_file_content/i);
});

test('work import commit is transactional, owner-bound and writes immutable history',()=>{
  assert.ok(store.includes('return withTransaction(async client=>'));
  assert.ok(store.includes('WORK_IMPORT_OWNER_REQUIRED'));
  assert.ok(store.includes("'work_import_commit'"));
  assert.ok(store.includes('record_histories'));
  assert.ok(store.includes("state='committed'"));
});

test('work import rollback refuses to clobber later changes',()=>{
  assert.ok(store.includes('ROLLBACK_CONFLICT'));
  assert.ok(store.includes('String(current.source_batch_id)!==String(batchId)'));
  assert.ok(store.includes('Number(current.version)!==Number(row.committed_version)'));
  assert.ok(store.includes("'work_import_rollback'"));
});

test('work import update operations require strong If-Match concurrency',()=>{
  assert.ok(commit.includes('parseIfMatchHeader'));
  assert.ok(rollback.includes('parseIfMatchHeader'));
  assert.ok(commit.includes('setVersionEtag'));
  assert.ok(rollback.includes('setVersionEtag'));
});

test('single router exposes status, commit and rollback before preflight route',()=>{
  const status=router.indexOf('/work-import\\/batches\\/([^\\/]+)\\/?$');
  const commitRoute=router.indexOf('/work-import\\/batches\\/([^\\/]+)\\/commit');
  const rollbackRoute=router.indexOf('/work-import\\/batches\\/([^\\/]+)\\/rollback');
  const preflightRoute=router.indexOf('/work-import\\/preflight');
  assert.ok(status>=0&&commitRoute>=0&&rollbackRoute>=0&&preflightRoute>=0);
  assert.ok(commitRoute<preflightRoute&&rollbackRoute<preflightRoute&&status<preflightRoute);
});
