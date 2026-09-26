'use strict';

process.env.TSUBAME_DB_SSL=process.env.TSUBAME_DB_SSL||'disable';

const db=require('../api/_lib/db');
const {getDocumentStorageAdapter}=require('../api/_lib/document-storage');
const {getDocumentBackupAdapter,restoreVerifiedBackup}=require('../api/_lib/document-backup');

function problem(message){const e=new Error(message);e.code='DOCUMENT_RESTORE_ABORTED';return e}

async function restoreOneOriginal({
  documentId,
  queryFn=db.query,
  sourceAdapter=getDocumentStorageAdapter(),
  backupAdapter=getDocumentBackupAdapter(),
  approved=process.env.TSUBAME_DOCUMENT_RESTORE_APPROVED==='1'
}={}){
  if(!approved)throw problem('原本復元の明示承認フラグがありません');
  const id=String(documentId||'').trim();
  if(!id)throw problem('復元対象document idがありません');

  const row=(await queryFn(`
    select id,employee_id,storage_key,storage_version_id,content_type,size_bytes,content_sha256,version
      from documents
     where id=$1
       and storage_state='active'
       and malware_scan_status='clean'
       and archived_at is null
       and storage_key is not null
       and content_sha256 is not null
     limit 1
  `,[id])).rows?.[0];
  if(!row)throw problem('復元可能なactive/clean原本が見つかりません');

  const restored=await restoreVerifiedBackup({
    storageKey:row.storage_key,storageVersionId:row.storage_version_id||'',
    contentType:row.content_type,sizeBytes:row.size_bytes,sha256:row.content_sha256
  },backupAdapter);

  const primary=await sourceAdapter.restoreObjectFromBackup({
    storageKey:row.storage_key,bytes:restored.bytes,contentType:row.content_type,sha256:row.content_sha256
  });

  const verified=await sourceAdapter.readObjectForBackup(row.storage_key);
  if(String(verified.sha256)!==String(row.content_sha256)||
     Number(verified.size_bytes)!==Number(row.size_bytes)||
     String(verified.content_type)!==String(row.content_type)){
    throw problem('一次原本復元後のMIME/size/SHA-256照合に失敗しました')
  }

  if(primary.restored&&String(primary.version_id||'')!==String(row.storage_version_id||'')){
    const updated=(await queryFn(`
      update documents
         set storage_version_id=$2,updated_at=now(),version=version+1
       where id=$1 and version=$3 and storage_state='active' and malware_scan_status='clean'
      returning id,version
    `,[row.id,primary.version_id||null,row.version])).rows?.[0];
    if(!updated)throw problem('復元中にdocumentが変更されたためDB更新を中止しました');
    await queryFn(`
      insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason)
      values('document',$1,$2,null,'document_original_restored',$3::jsonb,$4::jsonb,'secondary backup restore')
    `,[
      row.id,row.employee_id,
      JSON.stringify({storage_version_id:row.storage_version_id,version:row.version}),
      JSON.stringify({storage_version_id:primary.version_id,version:updated.version})
    ]);
    await queryFn(`
      insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary)
      values(null,'document_original_restored','document',$1,$2,'success','restore-script','secondary backup restore verified')
    `,[row.id,row.employee_id])
  }else{
    await queryFn(`
      insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary)
      values(null,'document_restore_tested','document',$1,$2,'success','restore-script','primary object already present and integrity verified')
    `,[row.id,row.employee_id])
  }

  return {
    restored:Boolean(primary.restored),
    already_present:Boolean(primary.already_present),
    sha256_verified:true,size_verified:true,mime_verified:true
  }
}

if(require.main===module){
  restoreOneOriginal({documentId:process.env.TSUBAME_RESTORE_DOCUMENT_ID})
    .then(result=>console.log(JSON.stringify({ok:true,...result,document_id_echoed:false,employee_data_echoed:false,secrets_echoed:false})))
    .catch(err=>{console.error(JSON.stringify({ok:false,error:err.code||'DOCUMENT_RESTORE_FAILED',message:err.message,document_id_echoed:false,employee_data_echoed:false,secrets_echoed:false}));process.exitCode=1})
    .finally(async()=>{await db.closePool()})
}
module.exports={restoreOneOriginal};
