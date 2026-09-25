const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const storage=require('../api/_lib/document-storage');
const upload=fs.readFileSync(path.join(__dirname,'..','api','v1','documents','upload-ticket.js'),'utf8');
const finalize=fs.readFileSync(path.join(__dirname,'..','api','v1','documents','finalize.js'),'utf8');
const download=fs.readFileSync(path.join(__dirname,'..','api','v1','documents','[id]','download-ticket.js'),'utf8');
const runtime=fs.readFileSync(path.join(__dirname,'..','api','_lib','runtime-config.js'),'utf8');

test('private document quarantine keys do not contain employee identity or original filename',()=>{
  const a=storage.randomQuarantinePath('application/pdf');
  const b=storage.randomQuarantinePath('application/pdf');
  assert.match(a,/^quarantine\/\d{4}\/\d{2}\/\d{2}\/[0-9a-f-]{36}\.pdf$/);
  assert.notEqual(a,b);
  assert.equal(a.includes('employee'),false);
});

test('private document adapter constrains type and size before signed upload issuance',()=>{
  assert.deepEqual(storage.validateUploadSpec({contentType:'application/pdf',size:1024}),{contentType:'application/pdf',size:1024});
  assert.throws(()=>storage.validateUploadSpec({contentType:'text/html',size:100}),e=>e?.code==='DOCUMENT_CONTENT_TYPE_NOT_ALLOWED');
  assert.throws(()=>storage.validateUploadSpec({contentType:'application/pdf',size:storage.DEFAULT_MAX_BYTES+1}),e=>e?.code==='DOCUMENT_FILE_SIZE_NOT_ALLOWED');
});

test('upload tickets are bound in DB before any later finalize path can trust browser metadata',()=>{
  assert.ok(upload.includes('document_upload_tickets'));
  assert.ok(upload.includes('expected_content_type'));
  assert.ok(upload.includes('expected_size_bytes'));
  assert.ok(upload.includes('QUALIFICATION_EMPLOYEE_MISMATCH'));
  assert.ok(upload.includes("state:'quarantine'"));
  assert.equal(upload.includes('storage_key:'),false);
});

test('download authorization requires active clean metadata and returns short-lived private URL only',()=>{
  assert.ok(download.includes("doc.storage_state!=='active'"));
  assert.ok(download.includes("doc.malware_scan_status!=='clean'"));
  assert.ok(download.includes('issuePrivateDownload'));
  assert.ok(download.includes("'60秒private GET認可'"));
});

test('finalize and production activation remain fail-closed until malware scanner exists',()=>{
  assert.ok(finalize.includes('documentMalwareScannerReady'));
  assert.ok(finalize.includes('DOCUMENT_MALWARE_SCANNER_NOT_READY'));
  assert.ok(runtime.includes('documentMalwareScannerReady'));
  assert.ok(runtime.includes('&& documentMalwareScannerReady()'));
});
