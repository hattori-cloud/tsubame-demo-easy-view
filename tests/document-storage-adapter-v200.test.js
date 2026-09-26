const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const storage=fs.readFileSync(path.join(__dirname,'..','api','_lib','document-storage.js'),'utf8');
const upload=fs.readFileSync(path.join(__dirname,'..','api','v1','documents','upload-ticket.js'),'utf8');
const finalize=fs.readFileSync(path.join(__dirname,'..','api','v1','documents','finalize.js'),'utf8');
const download=fs.readFileSync(path.join(__dirname,'..','api','v1','documents','[id]','download-ticket.js'),'utf8');
const runtime=fs.readFileSync(path.join(__dirname,'..','api','_lib','runtime-config.js'),'utf8');
const pkg=require('../package.json');

test('document storage ticket is encrypted and storage keys are opaque',()=>{
  assert.ok(storage.includes("createCipheriv('aes-256-gcm'"));
  assert.ok(storage.includes("createDecipheriv('aes-256-gcm'"));
  assert.ok(storage.includes("'quarantine/'+crypto.randomUUID().replace(/-/g,'')"));
  assert.ok(storage.includes("['application/pdf','image/jpeg','image/png']"));
});

test('CI memory provider is explicitly non-production only',()=>{
  assert.ok(storage.includes("if(isProductionRuntime())throw problem(503,'DOCUMENT_STORAGE_ADAPTER_NOT_READY'"));
  assert.ok(runtime.includes("provider==='ci-memory'&&isNonProductionRuntime()"));
});

test('Vercel private Blob transport uses short-lived private signed URLs',()=>{
  assert.equal(pkg.dependencies['@vercel/blob'],'2.8.0');
  assert.ok(storage.includes("VERCEL_PRIVATE_PROVIDER='vercel-blob-private'"));
  assert.ok(storage.includes("operations:[operation]"));
  assert.ok(storage.includes("access:'private'"));
  assert.ok(storage.includes("allowOverwrite=false"));
  assert.ok(storage.includes("addRandomSuffix=false"));
  assert.ok(storage.includes("signOptions.useCache=Boolean(useCache)"));
  assert.ok(storage.includes("malware_status:'pending'"));
  assert.equal(storage.includes("access:'public'"),false);
});

test('production storage transport and malware readiness are separate fail-closed gates',()=>{
  assert.ok(runtime.includes('function documentStorageTransportReady()'));
  assert.ok(runtime.includes('function documentMalwareScannerReady()'));
  assert.ok(runtime.includes('function originalDocumentPipelineReady()'));
  assert.ok(runtime.includes('originalDocumentPipelineReady()'));
  assert.ok(finalize.includes('DOCUMENT_ORIGINAL_PIPELINE_NOT_READY'));
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
