const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('crypto');

const runtime=require('../api/_lib/runtime-config');
const backup=require('../api/_lib/document-backup');

function snapshot(){
  const keys=[
    'VERCEL_ENV','TSUBAME_DOCUMENT_BACKUP_PROVIDER','TSUBAME_DOCUMENT_BACKUP_APPROVED',
    'TSUBAME_DOCUMENT_BACKUP_SEPARATE_FAILURE_DOMAIN','TSUBAME_DOCUMENT_BACKUP_URL',
    'TSUBAME_DOCUMENT_BACKUP_TOKEN','TSUBAME_DOCUMENT_BACKUP_ENCRYPTION_KEY'
  ];
  return Object.fromEntries(keys.map(k=>[k,process.env[k]]))
}
function restore(saved){for(const [k,v] of Object.entries(saved)){if(v===undefined)delete process.env[k];else process.env[k]=v}}

test('backup readiness requires approval separate failure domain HTTPS token and 32-byte encryption key',()=>{
  const saved=snapshot();
  try{
    process.env.VERCEL_ENV='production';
    process.env.TSUBAME_DOCUMENT_BACKUP_PROVIDER='private-https';
    process.env.TSUBAME_DOCUMENT_BACKUP_APPROVED='1';
    process.env.TSUBAME_DOCUMENT_BACKUP_SEPARATE_FAILURE_DOMAIN='1';
    process.env.TSUBAME_DOCUMENT_BACKUP_URL='https://backup.internal.example/originals';
    process.env.TSUBAME_DOCUMENT_BACKUP_TOKEN='12345678901234567890123456789012';
    process.env.TSUBAME_DOCUMENT_BACKUP_ENCRYPTION_KEY=Buffer.alloc(32,4).toString('base64');
    assert.equal(runtime.documentBackupReady(),true);
    process.env.TSUBAME_DOCUMENT_BACKUP_URL='http://backup.internal.example/originals';
    assert.equal(runtime.documentBackupReady(),false);
    process.env.TSUBAME_DOCUMENT_BACKUP_URL='https://user:pass@backup.internal.example/originals';
    assert.equal(runtime.documentBackupReady(),false);
    process.env.TSUBAME_DOCUMENT_BACKUP_URL='https://backup.internal.example/originals?token=bad';
    assert.equal(runtime.documentBackupReady(),false)
  }finally{backup._test.reset();restore(saved)}
});

test('backup envelope is encrypted authenticated and restores exact SHA size and MIME',()=>{
  const saved=snapshot(),bytes=Buffer.from('%PDF-1.7\nbackup test\n%%EOF','utf8');
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  try{
    process.env.VERCEL_ENV='preview';
    process.env.TSUBAME_DOCUMENT_BACKUP_PROVIDER='ci-memory';
    process.env.TSUBAME_DOCUMENT_BACKUP_ENCRYPTION_KEY=Buffer.alloc(32,5).toString('base64');
    const envelope=backup.encryptBackup(bytes,{contentType:'application/pdf',sha256});
    assert.equal(envelope.includes(bytes),false);
    const restored=backup.decryptBackup(envelope);
    assert.deepEqual(restored.bytes,bytes);
    assert.equal(restored.sha256,sha256);
    assert.equal(restored.size_bytes,bytes.length);
    assert.equal(restored.content_type,'application/pdf');
    const tampered=Buffer.from(envelope);tampered[tampered.length-1]^=1;
    assert.throws(()=>backup.decryptBackup(tampered),e=>e?.code==='DOCUMENT_BACKUP_AUTH_FAILED');
  }finally{backup._test.reset();restore(saved)}
});

test('backup key is opaque and does not disclose primary storage key',()=>{
  const saved=snapshot();
  try{
    process.env.VERCEL_ENV='preview';
    process.env.TSUBAME_DOCUMENT_BACKUP_PROVIDER='ci-memory';
    process.env.TSUBAME_DOCUMENT_BACKUP_ENCRYPTION_KEY=Buffer.alloc(32,6).toString('base64');
    const source='quarantine/0123456789abcdef0123456789abcdef';
    const sha='a'.repeat(64);
    const key=backup.backupObjectKey(source,'v1',sha);
    assert.match(key,/^original\/[0-9a-f]{64}$/);
    assert.equal(key.includes(source),false);
    assert.equal(key.includes('0123456789abcdef'),false)
  }finally{backup._test.reset();restore(saved)}
});

test('private backup transport uses fixed HTTPS endpoint headers and no query secrets',async()=>{
  const saved=snapshot(),bytes=Buffer.from('%PDF-1.7\ntransport test\n%%EOF','utf8');
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const objects=new Map(),calls=[];
  try{
    process.env.VERCEL_ENV='production';
    process.env.TSUBAME_DOCUMENT_BACKUP_PROVIDER='private-https';
    process.env.TSUBAME_DOCUMENT_BACKUP_APPROVED='1';
    process.env.TSUBAME_DOCUMENT_BACKUP_SEPARATE_FAILURE_DOMAIN='1';
    process.env.TSUBAME_DOCUMENT_BACKUP_URL='https://backup.internal.example/originals';
    process.env.TSUBAME_DOCUMENT_BACKUP_TOKEN='12345678901234567890123456789012';
    process.env.TSUBAME_DOCUMENT_BACKUP_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
    backup._test.setFetch(async(url,options)=>{
      calls.push({url,method:options.method,headers:options.headers});
      const key=options.headers['X-Backup-Key'];
      if(options.method==='PUT'){objects.set(key,Buffer.from(options.body));return {ok:true,status:201}}
      if(options.method==='GET'){
        const data=objects.get(key);
        return data?{ok:true,status:200,async arrayBuffer(){return data.buffer.slice(data.byteOffset,data.byteOffset+data.byteLength)}}:{ok:false,status:404}
      }
      if(options.method==='DELETE'){objects.delete(key);return {ok:true,status:204}}
      return {ok:false,status:405}
    });
    const result=await backup.backupAndVerify({storageKey:'quarantine/aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa',storageVersionId:'v1',bytes,contentType:'application/pdf',sha256});
    assert.equal(result.sha256,sha256);
    assert.ok(calls.every(c=>c.url==='https://backup.internal.example/originals'));
    assert.ok(calls.every(c=>String(c.headers.Authorization).startsWith('Bearer ')));
    assert.ok(calls.every(c=>!String(c.url).includes('token')));
    assert.ok(calls.some(c=>c.method==='PUT'&&c.headers['If-None-Match']==='*'));
  }finally{backup._test.reset();restore(saved)}
});
