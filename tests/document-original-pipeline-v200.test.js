const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function src(...p){return fs.readFileSync(path.join(__dirname,'..',...p),'utf8')}
const store=src('api','_lib','document-original-store.js');
const finalize=src('api','v1','documents','finalize.js');
const storage=src('api','_lib','document-storage.js');

test('original finalize persists quarantine before scanner verdict',()=>{
  const reserve=store.slice(store.indexOf('async function reserveDocumentOriginal'),store.indexOf('async function recordDocumentScanResult'));
  assert.ok(reserve.includes("'quarantine'"));
  assert.ok(reserve.includes("'pending'"));
  assert.ok(reserve.includes('document_upload_received'));
  assert.ok(finalize.indexOf('reserveDocumentOriginal')<finalize.indexOf('scanBuffer'));
});

test('blocked and scanner-error states are durable and never activate',()=>{
  const scan=store.slice(store.indexOf('async function recordDocumentScanResult'),store.indexOf('async function activateDocumentOriginal'));
  assert.ok(scan.includes("verdict==='blocked'?'blocked':'quarantine'"));
  assert.ok(scan.includes('document_malware_blocked'));
  assert.ok(scan.includes('document_malware_error'));
  assert.ok(finalize.includes("if(scan.verdict!=='clean')throw scanFailure"));
  const activate=store.slice(store.indexOf('async function activateDocumentOriginal'),store.indexOf('async function auditDocumentDownload'));
  assert.ok(activate.includes("before.storage_state!=='quarantine'||before.malware_scan_status!=='clean'"));
});

test('finalize scans exact private bytes whose SHA is stored',()=>{
  assert.ok(storage.includes('readQuarantineForScan'));
  assert.ok(finalize.includes('adapter.readQuarantineForScan'));
  assert.ok(finalize.includes('sha256:inspection.sha256'));
  assert.ok(store.includes('DOCUMENT_SCAN_HASH_MISMATCH'));
});

test('same upload ticket is idempotent for transient scan retry but active or conflicting objects are rejected',()=>{
  const reserve=store.slice(store.indexOf('async function reserveDocumentOriginal'),store.indexOf('async function recordDocumentScanResult'));
  assert.ok(reserve.includes('on conflict do nothing'));
  assert.ok(reserve.includes('DOCUMENT_UPLOAD_CONFLICT'));
  assert.ok(reserve.includes('DOCUMENT_ALREADY_FINALIZED'));
});


test('scanner error audit uses error result instead of blocked',()=>{
  const scan=store.slice(store.indexOf('async function recordDocumentScanResult'),store.indexOf('async function activateDocumentOriginal'));
  assert.ok(scan.includes("verdict==='clean'?'success':verdict==='blocked'?'blocked':'error'"));
});
