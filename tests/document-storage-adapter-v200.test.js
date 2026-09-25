const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const storage=fs.readFileSync(path.join(__dirname,'..','api','_lib','document-storage.js'),'utf8');
const upload=fs.readFileSync(path.join(__dirname,'..','api','v1','documents','upload-ticket.js'),'utf8');
const finalize=fs.readFileSync(path.join(__dirname,'..','api','v1','documents','finalize.js'),'utf8');
const download=fs.readFileSync(path.join(__dirname,'..','api','v1','documents','[id]','download-ticket.js'),'utf8');
const runtime=fs.readFileSync(path.join(__dirname,'..','api','_lib','runtime-config.js'),'utf8');

test('document storage ticket is encrypted and storage keys are opaque',()=>{
  assert.ok(storage.includes("createCipheriv('aes-256-gcm'"));
  assert.ok(storage.includes("createDecipheriv('aes-256-gcm'"));
  assert.ok(storage.includes("'quarantine/'+crypto.randomUUID().replace(/-/g,'')"));
  assert.ok(storage.includes("['application/pdf','image/jpeg','image/png']"));
});

test('CI memory provider is explicitly non-production only',()=>{
  assert.ok(storage.includes("if(isProductionRuntime())throw problem(503,'DOCUMENT_STORAGE_ADAPTER_NOT_READY'"));
  assert.ok(runtime.includes("documentStorageProvider()==='ci-memory'&&isNonProductionRuntime()"));
  assert.ok(runtime.includes('Production remains fail-closed'));
});

test('original upload/finalize/download APIs use the provider-neutral adapter',()=>{
  assert.ok(upload.includes('getDocumentStorageAdapter'));
  assert.ok(upload.includes('encryptTicket'));
  assert.ok(upload.includes('prepareDocumentUpload'));
  assert.ok(finalize.includes('decryptTicket'));
  assert.ok(finalize.includes('inspectQuarantine'));
  assert.ok(finalize.includes('reserveDocumentOriginal'));
  assert.ok(finalize.includes('activateDocumentOriginal'));
  assert.ok(download.includes('createDownloadAuthorization'));
  assert.ok(download.includes('auditDocumentDownload'));
});

test('finalize returns no raw storage key or internal SHA',()=>{
  assert.ok(finalize.includes('function publicDocument'));
  assert.equal(finalize.includes('storage_key:d.storage_key'),false);
  assert.equal(finalize.includes('content_sha256:d.content_sha256'),false);
});
