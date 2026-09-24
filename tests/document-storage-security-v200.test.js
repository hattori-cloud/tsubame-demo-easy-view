const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const api=fs.readFileSync(path.join(__dirname,'..','docs','api-contract.md'),'utf8');
const storage=fs.readFileSync(path.join(__dirname,'..','docs','production-document-storage-v200.md'),'utf8');

function block(source,start,end){
  const a=source.indexOf(start),b=source.indexOf(end,a+start.length);
  assert.ok(a>=0,'missing '+start);
  assert.ok(b>a,'missing '+end);
  return source.slice(a,b)
}

test('production original storage stays disconnected and fail-closed in shared demo',()=>{
  const config=block(html,'const DOCUMENT_STORAGE_CONFIG=','const USERS=');
  assert.ok(config.includes('connected:false'));
  assert.ok(config.includes('privateByDefault:true'));
  assert.ok(config.includes('serverAuthorizationRequired:true'));
  assert.ok(config.includes('mfaForStrict:true'));
  assert.ok(config.includes('quarantineRequired:true'));
  assert.ok(config.includes('malwareScanRequired:true'));
  assert.ok(config.includes('hashVerificationRequired:true'));
  assert.ok(config.includes('downloadAuditRequired:true'));
  assert.ok(config.includes('backupRequired:true'));
  assert.ok(config.includes('restoreTestRequired:true'));
  assert.ok(config.includes('physicalPurgeTwoPerson:true'));
  assert.ok(config.includes('originalFilenameInStorageKey:false'));
});

test('manager UI exposes the storage security design but not a file upload control',()=>{
  const design=block(html,'function showDocumentStorageSecurityDesign','const PRODUCTION_TECH_ARCHITECTURE=');
  assert.ok(design.includes('隔離 → 検査 → 有効化'));
  assert.ok(design.includes('二者承認'));
  assert.ok(design.includes('復元試験必須'));
  const docForm=block(html,'function openDocumentForm','function replaceDocument');
  assert.equal(/type=["']file["']/.test(docForm),false);
});

test('production gate keeps original storage as blocking until connected',()=>{
  const gates=block(html,'function productionGateItems','function renderProductionGate');
  assert.ok(gates.includes("name:'書類原本ストレージ'"));
  assert.ok(gates.includes("DOCUMENT_STORAGE_CONFIG.connected?'ok':'bad'"));
  assert.ok(gates.includes('隔離検査'));
  assert.ok(gates.includes('物理削除二者承認'));
});

test('API contract binds upload to quarantine, scan, hash and authorization',()=>{
  assert.ok(api.includes('POST /api/v1/documents/upload-ticket'));
  assert.ok(api.includes('POST /api/v1/documents/finalize'));
  assert.ok(api.includes('private quarantine storage'));
  assert.ok(api.includes('SHA-256'));
  assert.ok(api.includes('malware scan state is `clean`'));
  assert.ok(api.includes('strict category still satisfies full-administrator + MFA'));
  assert.ok(api.includes('must not contain employee name, employee number or original file name'));
});

test('download contract never exposes permanent storage access',()=>{
  assert.ok(api.includes('GET /api/v1/documents/{id}/download-ticket'));
  assert.ok(api.includes('Raw object keys and permanent URLs are not returned'));
  assert.ok(api.includes('browser must not persist the temporary access URL'));
  assert.ok(api.includes('Every allow/deny decision is audited'));
});

test('retention and physical purge require review and separate approver',()=>{
  assert.ok(api.includes('POST /api/v1/documents/{id}/retention-review'));
  assert.ok(api.includes('Retention expiry never auto-deletes a file'));
  assert.ok(api.includes('POST /api/v1/documents/{id}/purge-requests'));
  assert.ok(api.includes('Requester and approver must be different users'));
  assert.ok(storage.includes('bulk purge without per-policy evidence is prohibited'));
});

test('restore acceptance includes object integrity and permission checks',()=>{
  assert.ok(storage.includes('staging'));
  assert.ok(storage.includes('SHA-256 match'));
  assert.ok(storage.includes('strict-document MFA path'));
  assert.ok(storage.includes('DB and object backups must not share a single failure domain'));
});
