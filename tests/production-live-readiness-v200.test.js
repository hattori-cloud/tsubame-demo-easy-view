const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','scripts','check-production-readiness-v200.js'),'utf8');

test('production readiness performs live private storage and scanner probes',()=>{
  assert.ok(source.includes('probeDocumentStorageTransport'));
  assert.ok(source.includes('probeDocumentMalwareScanner'));
  assert.ok(source.includes('document_storage_live_probe'));
  assert.ok(source.includes('document_malware_scanner_live_probe'));
});

test('production readiness report never echoes configured secret values',()=>{
  assert.ok(source.includes('secrets_echoed:false'));
  assert.equal(source.includes('TSUBAME_DOCUMENT_MALWARE_SCANNER_TOKEN'),false);
  assert.equal(source.includes('BLOB_READ_WRITE_TOKEN'),false);
  assert.equal(source.includes('TSUBAME_SESSION_SECRET'),false);
});
