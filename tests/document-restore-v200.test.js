const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('crypto');

const storage=require('../api/_lib/document-storage');
const backup=require('../api/_lib/document-backup');

function saveEnv(){
  const keys=['VERCEL_ENV','TSUBAME_DOCUMENT_STORAGE_PROVIDER','TSUBAME_DOCUMENT_TICKET_SECRET','TSUBAME_DOCUMENT_BACKUP_PROVIDER','TSUBAME_DOCUMENT_BACKUP_ENCRYPTION_KEY'];
  return Object.fromEntries(keys.map(k=>[k,process.env[k]]))
}
function restoreEnv(s){for(const [k,v] of Object.entries(s)){if(v===undefined)delete process.env[k];else process.env[k]=v}}

test('missing primary original restores from encrypted backup and verifies exact bytes',async()=>{
  const saved=saveEnv();
  try{
    process.env.VERCEL_ENV='preview';
    process.env.TSUBAME_DOCUMENT_STORAGE_PROVIDER='ci-memory';
    process.env.TSUBAME_DOCUMENT_TICKET_SECRET='12345678901234567890123456789012';
    process.env.TSUBAME_DOCUMENT_BACKUP_PROVIDER='ci-memory';
    process.env.TSUBAME_DOCUMENT_BACKUP_ENCRYPTION_KEY=Buffer.alloc(32,14).toString('base64');
    storage._test.resetCiStorage();backup._test.reset();

    const bytes=Buffer.from('%PDF-1.7\nrestore fixture\n%%EOF','utf8');
    const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
    const key='quarantine/55555555555555555555555555555555';
    const source=storage.getDocumentStorageAdapter();
    const auth=await source.createUploadAuthorization({storageKey:key,contentType:'application/pdf',sizeBytes:bytes.length});
    await storage._test.ciPutObject({uploadToken:auth.upload_token,body:bytes,contentType:'application/pdf'});
    const active=await source.activate(key);
    await backup.backupAndVerify({storageKey:key,storageVersionId:active.version_id,bytes,contentType:'application/pdf',sha256});
    storage._test.ciDeleteObject(key);

    const restoredBackup=await backup.restoreVerifiedBackup({storageKey:key,storageVersionId:active.version_id,contentType:'application/pdf',sizeBytes:bytes.length,sha256});
    const result=await source.restoreObjectFromBackup({storageKey:key,bytes:restoredBackup.bytes,contentType:'application/pdf',sha256});
    assert.equal(result.restored,true);
    const primary=await source.readObjectForBackup(key);
    assert.deepEqual(primary.bytes,bytes);
    assert.equal(primary.sha256,sha256)
  }finally{storage._test.resetCiStorage();backup._test.reset();restoreEnv(saved)}
});

test('restore is idempotent when same primary object already exists',async()=>{
  const saved=saveEnv();
  try{
    process.env.VERCEL_ENV='preview';
    process.env.TSUBAME_DOCUMENT_STORAGE_PROVIDER='ci-memory';
    process.env.TSUBAME_DOCUMENT_TICKET_SECRET='12345678901234567890123456789012';
    process.env.TSUBAME_DOCUMENT_BACKUP_PROVIDER='ci-memory';
    process.env.TSUBAME_DOCUMENT_BACKUP_ENCRYPTION_KEY=Buffer.alloc(32,15).toString('base64');
    storage._test.resetCiStorage();backup._test.reset();
    const bytes=Buffer.from('%PDF-1.7\nidempotent\n%%EOF','utf8');
    const sha256=crypto.createHash('sha256').update(bytes).digest('hex'),key='quarantine/66666666666666666666666666666666';
    const source=storage.getDocumentStorageAdapter();
    const auth=await source.createUploadAuthorization({storageKey:key,contentType:'application/pdf',sizeBytes:bytes.length});
    await storage._test.ciPutObject({uploadToken:auth.upload_token,body:bytes,contentType:'application/pdf'});
    await source.activate(key);
    const result=await source.restoreObjectFromBackup({storageKey:key,bytes,contentType:'application/pdf',sha256});
    assert.equal(result.restored,false);
    assert.equal(result.already_present,true)
  }finally{storage._test.resetCiStorage();backup._test.reset();restoreEnv(saved)}
});

test('restore never overwrites a different primary object',async()=>{
  const saved=saveEnv();
  try{
    process.env.VERCEL_ENV='preview';
    process.env.TSUBAME_DOCUMENT_STORAGE_PROVIDER='ci-memory';
    process.env.TSUBAME_DOCUMENT_TICKET_SECRET='12345678901234567890123456789012';
    storage._test.resetCiStorage();
    const existing=Buffer.from('%PDF-1.7\nexisting\n%%EOF','utf8');
    const wanted=Buffer.from('%PDF-1.7\nwanted\n%%EOF','utf8');
    const wantedSha=crypto.createHash('sha256').update(wanted).digest('hex'),key='quarantine/77777777777777777777777777777777';
    const source=storage.getDocumentStorageAdapter();
    const auth=await source.createUploadAuthorization({storageKey:key,contentType:'application/pdf',sizeBytes:existing.length});
    await storage._test.ciPutObject({uploadToken:auth.upload_token,body:existing,contentType:'application/pdf'});
    await source.activate(key);
    await assert.rejects(
      source.restoreObjectFromBackup({storageKey:key,bytes:wanted,contentType:'application/pdf',sha256:wantedSha}),
      e=>e?.code==='DOCUMENT_RESTORE_PRIMARY_CONFLICT'
    )
  }finally{storage._test.resetCiStorage();restoreEnv(saved)}
});
