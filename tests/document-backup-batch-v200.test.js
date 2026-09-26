const test=require('node:test');
const assert=require('node:assert/strict');
const crypto=require('crypto');

const backup=require('../api/_lib/document-backup');
const {backupActiveOriginals}=require('../scripts/backup-original-documents-v200');

function withKey(fn){
  const old=process.env.TSUBAME_DOCUMENT_BACKUP_ENCRYPTION_KEY;
  process.env.TSUBAME_DOCUMENT_BACKUP_ENCRYPTION_KEY=Buffer.alloc(32,13).toString('base64');
  return Promise.resolve().then(fn).finally(()=>{if(old===undefined)delete process.env.TSUBAME_DOCUMENT_BACKUP_ENCRYPTION_KEY;else process.env.TSUBAME_DOCUMENT_BACKUP_ENCRYPTION_KEY=old})
}
function memoryAdapter(){
  const objects=new Map();
  return {
    objects,
    async write(key,value){objects.set(key,Buffer.from(value));return {created:true}},
    async read(key){const v=objects.get(key);if(!v)throw new Error('missing');return Buffer.from(v)},
    async remove(key){objects.delete(key)}
  }
}

test('backup batch selects only active clean originals and verifies every selected object',()=>withKey(async()=>{
  const a=Buffer.from('%PDF-1.7\nA\n%%EOF','utf8'),b=Buffer.from('%PDF-1.7\nB\n%%EOF','utf8');
  const rows=[
    {id:'1',storage_key:'quarantine/11111111111111111111111111111111',storage_version_id:'v1',content_type:'application/pdf',size_bytes:a.length,content_sha256:crypto.createHash('sha256').update(a).digest('hex')},
    {id:'2',storage_key:'quarantine/22222222222222222222222222222222',storage_version_id:'v2',content_type:'application/pdf',size_bytes:b.length,content_sha256:crypto.createHash('sha256').update(b).digest('hex')}
  ];
  let sql='',params;
  const queryFn=async(q,p)=>{sql=q;params=p;return {rows}};
  const byKey=new Map([[rows[0].storage_key,a],[rows[1].storage_key,b]]);
  const sourceAdapter={async readObjectForBackup(key){const bytes=byKey.get(key);return {bytes,content_type:'application/pdf',size_bytes:bytes.length}}};
  const target=memoryAdapter();
  const result=await backupActiveOriginals({queryFn,sourceAdapter,backupAdapter:target,limit:25});
  assert.deepEqual(result,{selected:2,verified:2});
  assert.ok(sql.includes("storage_state='active'"));
  assert.ok(sql.includes("malware_scan_status='clean'"));
  assert.ok(sql.includes('archived_at is null'));
  assert.deepEqual(params,[25]);
  assert.equal(target.objects.size,2);
}));

test('backup batch fails closed when source bytes differ from DB SHA',()=>withKey(async()=>{
  const bytes=Buffer.from('%PDF-1.7\nactual\n%%EOF','utf8');
  const row={id:'1',storage_key:'quarantine/33333333333333333333333333333333',storage_version_id:'v1',content_type:'application/pdf',size_bytes:bytes.length,content_sha256:'0'.repeat(64)};
  const queryFn=async()=>({rows:[row]});
  const sourceAdapter={async readObjectForBackup(){return {bytes,content_type:'application/pdf',size_bytes:bytes.length}}};
  await assert.rejects(
    backupActiveOriginals({queryFn,sourceAdapter,backupAdapter:memoryAdapter(),limit:1}),
    /backup source SHA-256 mismatch/
  )
}));

test('backup batch fails closed on MIME or size mismatch before secondary write',()=>withKey(async()=>{
  const bytes=Buffer.from('%PDF-1.7\nactual\n%%EOF','utf8');
  const sha=crypto.createHash('sha256').update(bytes).digest('hex');
  const base={id:'1',storage_key:'quarantine/44444444444444444444444444444444',storage_version_id:'v1',content_type:'application/pdf',size_bytes:bytes.length,content_sha256:sha};
  const target=memoryAdapter();
  await assert.rejects(
    backupActiveOriginals({
      queryFn:async()=>({rows:[base]}),
      sourceAdapter:{async readObjectForBackup(){return {bytes,content_type:'image/png',size_bytes:bytes.length}}},
      backupAdapter:target,limit:1
    }),
    /backup source MIME mismatch/
  );
  assert.equal(target.objects.size,0);

  await assert.rejects(
    backupActiveOriginals({
      queryFn:async()=>({rows:[base]}),
      sourceAdapter:{async readObjectForBackup(){return {bytes,content_type:'application/pdf',size_bytes:bytes.length+1}}},
      backupAdapter:target,limit:1
    }),
    /backup source size mismatch/
  );
  assert.equal(target.objects.size,0)
}));
