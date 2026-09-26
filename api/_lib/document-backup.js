const crypto=require('crypto');
const {
  isNonProductionRuntime,documentBackupProvider,documentBackupReady
}=require('./runtime-config');
const {validateStoredContentSignature}=require('./document-storage');

const MAGIC=Buffer.from('TSBKP001','ascii');
const ciObjects=new Map();
let fetchOverride=null;

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function masterKey(){
  let key;
  try{key=Buffer.from(String(process.env.TSUBAME_DOCUMENT_BACKUP_ENCRYPTION_KEY||''),'base64')}catch(_){key=null}
  if(!key||key.length!==32)throw problem(503,'DOCUMENT_BACKUP_KEY_NOT_CONFIGURED','原本バックアップ暗号鍵が未設定です');
  return key
}
function deriveKey(label){
  return crypto.createHmac('sha256',masterKey()).update('tsubame-v200:'+label).digest()
}
function normalizedHash(v){
  const x=String(v||'').toLowerCase();
  if(!/^[0-9a-f]{64}$/.test(x))throw problem(409,'DOCUMENT_BACKUP_HASH_INVALID','原本SHA-256を確認できません');
  return x
}
function backupObjectKey(storageKey,storageVersionId,sha256){
  const material=[String(storageKey||''),String(storageVersionId||''),normalizedHash(sha256)].join('|');
  if(!storageKey)throw problem(409,'DOCUMENT_BACKUP_STORAGE_KEY_MISSING','原本保存キーを確認できません');
  return 'original/'+crypto.createHmac('sha256',deriveKey('object-key')).update(material).digest('hex')
}
function encryptBackup(bytes,{contentType,sha256}){
  const body=Buffer.isBuffer(bytes)?bytes:Buffer.from(bytes||[]);
  const hash=normalizedHash(sha256);
  const actual=crypto.createHash('sha256').update(body).digest('hex');
  if(actual!==hash)throw problem(409,'DOCUMENT_BACKUP_SOURCE_HASH_MISMATCH','バックアップ元原本のSHA-256がDBと一致しません');
  validateStoredContentSignature(body,contentType);
  const meta=Buffer.from(JSON.stringify({v:1,content_type:String(contentType||''),size_bytes:body.length,sha256:hash}),'utf8');
  if(meta.length>4096)throw problem(500,'DOCUMENT_BACKUP_METADATA_TOO_LARGE','バックアップメタデータを作成できません');
  const len=Buffer.alloc(4);len.writeUInt32BE(meta.length);
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',deriveKey('encryption'),iv);
  cipher.setAAD(meta);
  const ciphertext=Buffer.concat([cipher.update(body),cipher.final()]);
  const tag=cipher.getAuthTag();
  return Buffer.concat([MAGIC,len,meta,iv,tag,ciphertext])
}
function decryptBackup(envelope){
  const buf=Buffer.isBuffer(envelope)?envelope:Buffer.from(envelope||[]);
  if(buf.length<8+4+12+16||!buf.subarray(0,8).equals(MAGIC))throw problem(409,'DOCUMENT_BACKUP_FORMAT_INVALID','バックアップ形式を確認できません');
  const metaLen=buf.readUInt32BE(8);
  if(metaLen<=0||metaLen>4096||buf.length<12+metaLen+28)throw problem(409,'DOCUMENT_BACKUP_FORMAT_INVALID','バックアップ形式を確認できません');
  const metaStart=12,metaEnd=metaStart+metaLen;
  let meta;
  try{meta=JSON.parse(buf.subarray(metaStart,metaEnd).toString('utf8'))}catch(_){throw problem(409,'DOCUMENT_BACKUP_METADATA_INVALID','バックアップメタデータを確認できません')}
  const iv=buf.subarray(metaEnd,metaEnd+12),tag=buf.subarray(metaEnd+12,metaEnd+28),ciphertext=buf.subarray(metaEnd+28);
  let bytes;
  try{
    const decipher=crypto.createDecipheriv('aes-256-gcm',deriveKey('encryption'),iv);
    decipher.setAAD(buf.subarray(metaStart,metaEnd));decipher.setAuthTag(tag);
    bytes=Buffer.concat([decipher.update(ciphertext),decipher.final()])
  }catch(_){throw problem(409,'DOCUMENT_BACKUP_AUTH_FAILED','バックアップの改ざんまたは暗号鍵不一致を検出しました')}
  const hash=normalizedHash(meta.sha256),actual=crypto.createHash('sha256').update(bytes).digest('hex');
  if(actual!==hash||Number(meta.size_bytes)!==bytes.length)throw problem(409,'DOCUMENT_BACKUP_RESTORE_MISMATCH','復元原本のサイズまたはSHA-256が一致しません');
  validateStoredContentSignature(bytes,meta.content_type);
  return {bytes,content_type:String(meta.content_type),size_bytes:bytes.length,sha256:hash}
}
function endpoint(){
  const value=String(process.env.TSUBAME_DOCUMENT_BACKUP_URL||'');
  if(!value)throw problem(503,'DOCUMENT_BACKUP_ENDPOINT_NOT_CONFIGURED','原本バックアップ先が未設定です');
  return value
}
function authHeaders(key){
  return {
    'Authorization':'Bearer '+String(process.env.TSUBAME_DOCUMENT_BACKUP_TOKEN||''),
    'X-Backup-Key':key,
    'Cache-Control':'no-store'
  }
}
async function http(url,options){
  const fn=fetchOverride||globalThis.fetch;
  if(typeof fn!=='function')throw problem(503,'DOCUMENT_BACKUP_FETCH_UNAVAILABLE','原本バックアップ通信を利用できません');
  return fn(url,options)
}
function ciAdapter(){
  if(!isNonProductionRuntime()||!documentBackupReady())throw problem(503,'DOCUMENT_BACKUP_NOT_READY','CIバックアップは非本番専用です');
  return {
    name:'ci-memory',
    async write(key,envelope){ciObjects.set(key,Buffer.from(envelope));return {created:true}},
    async read(key){const v=ciObjects.get(key);if(!v)throw problem(404,'DOCUMENT_BACKUP_OBJECT_MISSING','バックアップ原本が見つかりません');return Buffer.from(v)},
    async remove(key){ciObjects.delete(key)}
  }
}
function privateHttpsAdapter(){
  if(!documentBackupReady())throw problem(503,'DOCUMENT_BACKUP_NOT_READY','承認済み別障害領域バックアップが未接続です');
  const url=endpoint();
  return {
    name:'private-https',
    async write(key,envelope){
      const res=await http(url,{method:'PUT',redirect:'error',cache:'no-store',body:envelope,headers:{...authHeaders(key),'Content-Type':'application/octet-stream','If-None-Match':'*'}});
      if(res.ok)return {created:true};
      if(res.status===409||res.status===412)return {created:false,already_exists:true};
      throw problem(503,'DOCUMENT_BACKUP_WRITE_FAILED','原本バックアップ保存に失敗しました')
    },
    async read(key){
      const res=await http(url,{method:'GET',redirect:'error',cache:'no-store',headers:authHeaders(key)});
      if(!res.ok)throw problem(res.status===404?404:503,res.status===404?'DOCUMENT_BACKUP_OBJECT_MISSING':'DOCUMENT_BACKUP_READ_FAILED','原本バックアップ読込に失敗しました');
      return Buffer.from(await res.arrayBuffer())
    },
    async remove(key){
      const res=await http(url,{method:'DELETE',redirect:'error',cache:'no-store',headers:authHeaders(key)});
      if(!res.ok&&res.status!==404)throw problem(503,'DOCUMENT_BACKUP_DELETE_FAILED','原本バックアップ検査用データの削除に失敗しました')
    }
  }
}
function getDocumentBackupAdapter(){
  const provider=documentBackupProvider();
  if(provider==='ci-memory')return ciAdapter();
  if(provider==='private-https')return privateHttpsAdapter();
  throw problem(503,'DOCUMENT_BACKUP_NOT_READY','承認済み別障害領域バックアップが未接続です')
}
async function backupAndVerify({storageKey,storageVersionId,bytes,contentType,sha256},adapter=getDocumentBackupAdapter()){
  const key=backupObjectKey(storageKey,storageVersionId,sha256);
  const envelope=encryptBackup(bytes,{contentType,sha256});
  await adapter.write(key,envelope);
  const restored=decryptBackup(await adapter.read(key));
  if(restored.sha256!==normalizedHash(sha256)||restored.size_bytes!==Buffer.byteLength(bytes)||restored.content_type!==String(contentType)){
    throw problem(409,'DOCUMENT_BACKUP_RESTORE_MISMATCH','復元原本がバックアップ元と一致しません')
  }
  return {backup_key:key,sha256:restored.sha256,size_bytes:restored.size_bytes,content_type:restored.content_type}
}
async function restoreVerifiedBackup({storageKey,storageVersionId,contentType,sizeBytes,sha256},adapter=getDocumentBackupAdapter()){
  const key=backupObjectKey(storageKey,storageVersionId,sha256);
  const restored=decryptBackup(await adapter.read(key));
  if(restored.sha256!==normalizedHash(sha256)||
     restored.size_bytes!==Number(sizeBytes)||
     restored.content_type!==String(contentType)){
    throw problem(409,'DOCUMENT_BACKUP_RESTORE_MISMATCH','バックアップ復元原本がDB記録と一致しません')
  }
  return {...restored,backup_key:key}
}
async function probeDocumentBackup(){
  if(!documentBackupReady())return false;
  const adapter=getDocumentBackupAdapter();
  const bytes=Buffer.from('%PDF-1.4\n% synthetic backup readiness probe\n%%EOF','utf8');
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const storageKey='quarantine/'+crypto.randomBytes(16).toString('hex');
  const backupKey=backupObjectKey(storageKey,'readiness-probe',sha256);
  try{
    const envelope=encryptBackup(bytes,{contentType:'application/pdf',sha256});
    await adapter.write(backupKey,envelope);
    const restored=decryptBackup(await adapter.read(backupKey));
    return restored.sha256===sha256&&restored.size_bytes===bytes.length&&restored.content_type==='application/pdf'
  }catch(_){return false}
  finally{try{await adapter.remove(backupKey)}catch(_){}}
}
function resetTestState(){ciObjects.clear();fetchOverride=null}
module.exports={
  backupObjectKey,encryptBackup,decryptBackup,getDocumentBackupAdapter,backupAndVerify,restoreVerifiedBackup,probeDocumentBackup,
  _test:{setFetch(v){fetchOverride=v},reset:resetTestState,ciObjects}
};
