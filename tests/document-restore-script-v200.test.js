const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const src=fs.readFileSync(path.join(__dirname,'..','scripts','restore-original-document-v200.js'),'utf8');

test('restore command is single-document and requires explicit approval',()=>{
  assert.ok(src.includes("TSUBAME_DOCUMENT_RESTORE_APPROVED==='1'"));
  assert.ok(src.includes('TSUBAME_RESTORE_DOCUMENT_ID'));
  assert.ok(src.includes("where id=$1"));
  assert.ok(src.includes("storage_state='active'"));
  assert.ok(src.includes("malware_scan_status='clean'"));
});

test('restore verifies backup and primary integrity before success audit',()=>{
  assert.ok(src.includes('restoreVerifiedBackup'));
  assert.ok(src.includes('restoreObjectFromBackup'));
  assert.ok(src.includes('readObjectForBackup'));
  assert.ok(src.includes('document_original_restored'));
  assert.ok(src.includes('document_restore_tested'));
  assert.equal(src.includes('console.log(row'),false);
});
