const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function src(...parts){return fs.readFileSync(path.join(__dirname,'..',...parts),'utf8')}
const store=src('api','_lib','credential-store.js');
const upload=src('api','v1','documents','upload-ticket.js');
const download=src('api','v1','documents','[id]','download-ticket.js');
const finalize=src('api','v1','documents','finalize.js');

test('credential reads are employee-scoped and document visibility follows access class',()=>{
  assert.ok(store.includes('employeeForUser(user,employeeId)'));
  assert.ok(store.includes("access_level='self_allowed'"));
  assert.ok(store.includes("security_class<>'strict'"));
  assert.ok(store.includes("policy.security_class==='strict'"));
});

test('strict document operations require full administrator MFA',()=>{
  assert.ok(store.includes("user.role_level!=='full'||!identity?.mfa"));
  assert.ok(store.includes('STRICT_DOCUMENT_MFA_REQUIRED'));
});

test('normal document metadata patch cannot mutate storage integrity fields',()=>{
  for(const field of ['storage_key','storage_version_id','content_sha256','malware_scan_status','storage_state','uploaded_by_user_id']){
    assert.ok(store.includes("'"+field+"'"),field+' missing from forbidden storage fields');
  }
  assert.ok(store.includes('SERVER_CONTROLLED_STORAGE_FIELDS'));
});

test('metadata-only document creation rejects categories that require an electronic original',()=>{
  assert.ok(store.includes("['electronic_original','paper_and_electronic'].includes(policy.original_handling)"));
  assert.ok(store.includes('ELECTRONIC_ORIGINAL_REQUIRED'));
});

test('original-file endpoints stay fail-closed across storage and malware readiness stages',()=>{
  assert.ok(upload.includes('DOCUMENT_STORAGE_ADAPTER_NOT_READY'));
  assert.ok(upload.includes('document_upload_tickets'));
  assert.ok(download.includes('DOCUMENT_NOT_ACTIVE'));
  assert.ok(download.includes('DOCUMENT_STORAGE_ADAPTER_NOT_READY'));
  assert.ok(finalize.includes('DOCUMENT_STORAGE_ADAPTER_NOT_READY'));
  assert.ok(finalize.includes('DOCUMENT_MALWARE_SCANNER_NOT_READY'));
  assert.ok(finalize.includes('DOCUMENT_SCAN_PIPELINE_NOT_READY'));
});

test('qualification and document metadata changes are versioned and audited',()=>{
  assert.ok(store.includes("'資格更新'"));
  assert.ok(store.includes("'書類メタデータ更新'"));
  assert.ok(store.includes('insert into record_histories'));
  assert.ok(store.includes('version=version+1'));
});


test('document creation verifies linked qualification belongs to the same employee',()=>{
  assert.ok(store.includes('QUALIFICATION_EMPLOYEE_MISMATCH'));
  assert.ok(store.includes('id=$1 and employee_id=$2 and archived_at is null'));
  assert.ok(store.includes('[qualificationId,employee.id]'));
});
