const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const sql=fs.readFileSync(path.join(__dirname,'..','docs','production-schema.sql'),'utf8');

function block(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0,'missing '+start);
  assert.ok(b>a,'missing '+end);
  return html.slice(a,b)
}

test('demo document flow has no raw file upload control',()=>{
  const form=block('function openDocumentForm','function replaceDocument');
  assert.equal(/type=["']file["']/.test(form),false);
  assert.match(form,/原本ファイルを選ぶ欄は、セキュリティ上デモには設けていません/)
});

test('strict documents are full-admin only',()=>{
  const access=block('function documentSecurityClass','function allowedDepartmentsForOffice');
  assert.match(access,/security==='厳格'\|\|access==='全社管理者のみ'/);
  assert.match(access,/return isFullCompanyAdmin\(\)/);
  assert.match(access,/function canVerifyOriginalDocument\(\)\{return isFullCompanyAdmin\(\)\}/)
});

test('document deletion is archival, not physical removal',()=>{
  const del=block('function deleteDocument','let ORIGINAL_DOCUMENT_PAGE');
  assert.match(del,/d\.archived=true/);
  assert.match(del,/物理削除なし/);
  assert.equal(/DOCS=DOCS\.filter/.test(del),false)
});

test('replacement preserves old/new linkage',()=>{
  const form=block('function openDocumentForm','function verifyOriginalDocument');
  assert.match(form,/replacedFromDocumentId=source\?\.id/);
  assert.match(form,/source\.replacedByDocumentId=id/);
  assert.match(form,/source\.status='差替え済み'/)
});

test('original-document center uses simple priority KPIs',()=>{
  const center=block('function openOriginalDocumentCenter','function setOriginalDocumentState');
  for(const label of ['未確認','差替え待ち','30日以内・超過','厳格書類'])assert.ok(center.includes(label));
  assert.ok(center.includes('社員 → 書類 → 原本 → 次にやること'))
});

test('production document schema stores security and integrity metadata',()=>{
  for(const field of ['security_class','access_level','original_handling','retention_until','content_sha256','malware_scan_status','replaced_from_document_id','replaced_by_document_id'])assert.ok(sql.includes(field),field);
  assert.ok(sql.includes("security_class <> 'strict' or access_level = 'full_admin'"));
  assert.ok(sql.includes('documents_storage_key_uidx'))
});

test('document storage policy requires short lived authorized access',()=>{
  assert.ok(html.includes('signedUrlSeconds:60'));
  assert.ok(html.includes('serverAuthorizationRequired:true'));
  assert.ok(html.includes('mfaForStrict:true'));
  assert.ok(html.includes('malwareScanRequired:true'));
  assert.ok(html.includes('downloadAuditRequired:true'))
});
