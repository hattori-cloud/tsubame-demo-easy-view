'use strict';

process.env.TSUBAME_DB_SSL=process.env.TSUBAME_DB_SSL||'disable';

const crypto=require('crypto');
const db=require('../api/_lib/db');
const {getDocumentStorageAdapter}=require('../api/_lib/document-storage');
const {getDocumentBackupAdapter,backupAndVerify}=require('../api/_lib/document-backup');

function assert(condition,message){if(!condition)throw new Error(message)}
async function backupActiveOriginals({queryFn=db.query,sourceAdapter=getDocumentStorageAdapter(),backupAdapter=getDocumentBackupAdapter(),limit=1000}={}){
  const max=Math.min(5000,Math.max(1,Number(limit)||1000));
  const rows=(await queryFn(`
    select id,storage_key,storage_version_id,content_type,size_bytes,content_sha256
      from documents
     where storage_state='active'
       and malware_scan_status='clean'
       and archived_at is null
       and storage_key is not null
       and content_sha256 is not null
     order by activated_at nulls last,id
     limit $1
  `,[max])).rows||[];
  let verified=0;
  for(const row of rows){
    const source=await sourceAdapter.readObjectForBackup(row.storage_key);
    const bytes=Buffer.from(source.bytes||[]);
    const sha=crypto.createHash('sha256').update(bytes).digest('hex');
    assert(String(source.content_type)===String(row.content_type),'backup source MIME mismatch');
    assert(Number(source.size_bytes)===Number(row.size_bytes)&&bytes.length===Number(row.size_bytes),'backup source size mismatch');
    assert(sha===String(row.content_sha256),'backup source SHA-256 mismatch');
    await backupAndVerify({
      storageKey:row.storage_key,storageVersionId:row.storage_version_id||'',bytes,
      contentType:row.content_type,sha256:row.content_sha256
    },backupAdapter);
    verified++
  }
  return {selected:rows.length,verified}
}

if(require.main===module){
  backupActiveOriginals({limit:process.env.TSUBAME_DOCUMENT_BACKUP_BATCH_LIMIT||1000})
    .then(result=>{
      console.log(JSON.stringify({ok:true,...result,real_employee_data_echoed:false,secrets_echoed:false}))
    })
    .catch(err=>{
      console.error(JSON.stringify({ok:false,error:'DOCUMENT_BACKUP_FAILED',message:err.message,real_employee_data_echoed:false,secrets_echoed:false}));
      process.exitCode=1
    })
    .finally(async()=>{await db.closePool()})
}
module.exports={backupActiveOriginals};
