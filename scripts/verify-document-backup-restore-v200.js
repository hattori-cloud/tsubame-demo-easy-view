'use strict';

process.env.VERCEL_ENV='preview';
process.env.NODE_ENV='test';
process.env.TSUBAME_DOCUMENT_BACKUP_PROVIDER='ci-memory';
process.env.TSUBAME_DOCUMENT_BACKUP_ENCRYPTION_KEY=Buffer.alloc(32,11).toString('base64');

const crypto=require('crypto');
const backup=require('../api/_lib/document-backup');

function assert(condition,message){if(!condition)throw new Error(message)}

(async()=>{
  backup._test.reset();
  const bytes=Buffer.from('%PDF-1.7\nFictional backup/restore original\n%%EOF','utf8');
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const storageKey='quarantine/11111111111111111111111111111111';
  const result=await backup.backupAndVerify({
    storageKey,storageVersionId:'ci-version-1',bytes,contentType:'application/pdf',sha256
  });
  assert(result.sha256===sha256,'restored SHA-256 mismatch');
  assert(result.size_bytes===bytes.length,'restored size mismatch');
  assert(result.content_type==='application/pdf','restored MIME mismatch');
  assert(!result.backup_key.includes(storageKey),'backup key leaked source storage key');

  const envelope=backup.encryptBackup(bytes,{contentType:'application/pdf',sha256});
  const tampered=Buffer.from(envelope);tampered[tampered.length-1]^=0xff;
  let tamperRejected=false;
  try{backup.decryptBackup(tampered)}catch(err){tamperRejected=err.code==='DOCUMENT_BACKUP_AUTH_FAILED'}
  assert(tamperRejected,'tampered encrypted backup was not rejected');

  assert(await backup.probeDocumentBackup()===true,'synthetic backup live probe failed');

  console.log(JSON.stringify({
    ok:true,aes_256_gcm_encrypted:true,opaque_backup_key:true,
    restore_sha256_match:true,restore_size_match:true,restore_mime_match:true,
    tamper_rejected:true,synthetic_live_probe:true,real_employee_data_used:false
  }))
})().catch(err=>{console.error(err.stack||err);process.exitCode=1});
