const crypto=require('crypto');
const {isProductionRuntime}=require('./runtime-config');

const CI_PROVIDER='ci-memory';
const memoryObjects=new Map();
const memoryUploadAuth=new Map();
const memoryDownloadAuth=new Map();

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function providerName(){return String(process.env.TSUBAME_DOCUMENT_STORAGE_PROVIDER||'').trim().toLowerCase()}
function ticketSecret(){
  const secret=String(process.env.TSUBAME_DOCUMENT_TICKET_SECRET||'');
  if(secret.length<32)throw problem(503,'DOCUMENT_TICKET_SECRET_NOT_CONFIGURED','原本アップロードticket秘密鍵が未設定です');
  return crypto.createHash('sha256').update(secret).digest()
}
function encryptTicket(claims,ttlSeconds=60){
  const now=Math.floor(Date.now()/1000),payload={...claims,iat:now,exp:now+ttlSeconds};
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',ticketSecret(),iv);
  const ciphertext=Buffer.concat([cipher.update(JSON.stringify(payload),'utf8'),cipher.final()]);
  const tag=cipher.getAuthTag();
  return [iv,ciphertext,tag].map(x=>x.toString('base64url')).join('.')
}
function decryptTicket(token){
  try{
    const parts=String(token||'').split('.');
    if(parts.length!==3)throw new Error('invalid parts');
    const [iv,ciphertext,tag]=parts.map(x=>Buffer.from(x,'base64url'));
    const decipher=crypto.createDecipheriv('aes-256-gcm',ticketSecret(),iv);
    decipher.setAuthTag(tag);
    const payload=JSON.parse(Buffer.concat([decipher.update(ciphertext),decipher.final()]).toString('utf8'));
    if(!payload.exp||Number(payload.exp)<=Math.floor(Date.now()/1000))throw problem(401,'DOCUMENT_UPLOAD_TICKET_EXPIRED','原本アップロードticketの有効期限が切れています');
    return payload
  }catch(err){
    if(err?.code)throw err;
    throw problem(401,'DOCUMENT_UPLOAD_TICKET_INVALID','原本アップロードticketを確認できません')
  }
}
function randomStorageKey(){
  return 'quarantine/'+crypto.randomUUID().replace(/-/g,'')
}
function allowedContentTypes(){
  return new Set(['application/pdf','image/jpeg','image/png'])
}
function maxUploadBytes(){
  const n=Number.parseInt(process.env.TSUBAME_DOCUMENT_MAX_BYTES||'',10);
  return Math.min(25*1024*1024,Math.max(1024,Number.isFinite(n)?n:10*1024*1024))
}
function validateUploadRequest({contentType,sizeBytes}){
  const type=String(contentType||'').toLowerCase();
  const size=Number(sizeBytes);
  if(!allowedContentTypes().has(type))throw problem(422,'DOCUMENT_CONTENT_TYPE_NOT_ALLOWED','PDF・JPEG・PNGのみ原本登録できます');
  if(!Number.isSafeInteger(size)||size<=0||size>maxUploadBytes())throw problem(422,'DOCUMENT_SIZE_NOT_ALLOWED','原本ファイルサイズを確認してください');
  return {contentType:type,sizeBytes:size}
}
function ciAdapter(){
  if(isProductionRuntime())throw problem(503,'DOCUMENT_STORAGE_ADAPTER_NOT_READY','productionではCI原本アダプターを利用できません');
  return {
    name:CI_PROVIDER,
    async createUploadAuthorization({storageKey,contentType,sizeBytes,expiresSeconds=60}){
      const token=crypto.randomBytes(24).toString('base64url'),expiresAt=new Date(Date.now()+expiresSeconds*1000).toISOString();
      memoryUploadAuth.set(token,{storageKey,contentType,sizeBytes,expiresAt});
      return {method:'PUT',upload_url:'ci-memory://upload/'+token,upload_token:token,expires_at:expiresAt}
    },
    async inspectQuarantine(storageKey){
      const obj=memoryObjects.get(storageKey);
      if(!obj||obj.state!=='quarantine')throw problem(409,'DOCUMENT_QUARANTINE_OBJECT_MISSING','隔離中の原本を確認できません');
      return {...obj}
    },
    async activate(storageKey){
      const obj=memoryObjects.get(storageKey);
      if(!obj||obj.state!=='quarantine')throw problem(409,'DOCUMENT_QUARANTINE_OBJECT_MISSING','隔離中の原本を確認できません');
      if(obj.malware_status!=='clean')throw problem(409,'DOCUMENT_MALWARE_NOT_CLEAN','安全確認済み原本だけを有効化できます');
      obj.state='active';obj.version_id=crypto.randomUUID();memoryObjects.set(storageKey,obj);
      return {storage_key:storageKey,version_id:obj.version_id}
    },
    async createDownloadAuthorization({storageKey,expiresSeconds=60}){
      const obj=memoryObjects.get(storageKey);
      if(!obj||obj.state!=='active')throw problem(409,'DOCUMENT_OBJECT_NOT_ACTIVE','有効な原本を確認できません');
      const token=crypto.randomBytes(24).toString('base64url'),expiresAt=new Date(Date.now()+expiresSeconds*1000).toISOString();
      memoryDownloadAuth.set(token,{storageKey,expiresAt});
      return {download_url:'ci-memory://download/'+token,expires_at:expiresAt}
    }
  }
}
function getDocumentStorageAdapter(){
  const provider=providerName();
  if(provider===CI_PROVIDER)return ciAdapter();
  throw problem(503,'DOCUMENT_STORAGE_ADAPTER_NOT_READY','承認済みprivate原本ストレージアダプターが未接続です')
}
function adapterReady(){
  return providerName()===CI_PROVIDER&&!isProductionRuntime()&&String(process.env.TSUBAME_DOCUMENT_TICKET_SECRET||'').length>=32
}
async function ciPutObject({uploadToken,body,contentType}){
  if(providerName()!==CI_PROVIDER||isProductionRuntime())throw problem(403,'CI_STORAGE_ONLY','CI原本アダプターは非本番専用です');
  const auth=memoryUploadAuth.get(String(uploadToken||''));
  if(!auth||new Date(auth.expiresAt).getTime()<=Date.now())throw problem(401,'UPLOAD_AUTH_EXPIRED','アップロード認可を確認できません');
  const bytes=Buffer.isBuffer(body)?body:Buffer.from(body||[]);
  if(bytes.length!==Number(auth.sizeBytes))throw problem(422,'UPLOAD_SIZE_MISMATCH','アップロードサイズが一致しません');
  if(String(contentType||'').toLowerCase()!==String(auth.contentType))throw problem(422,'UPLOAD_TYPE_MISMATCH','アップロード形式が一致しません');
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const malwareStatus=bytes.toString('utf8',0,Math.min(bytes.length,64)).startsWith('CI-MALWARE-BLOCK')?'blocked':'clean';
  const obj={
    storage_key:auth.storageKey,state:'quarantine',content_type:auth.contentType,size_bytes:bytes.length,
    sha256,malware_status:malwareStatus,malware_scanned_at:new Date().toISOString(),bytes
  };
  memoryObjects.set(auth.storageKey,obj);memoryUploadAuth.delete(uploadToken);
  return {...obj,bytes:undefined}
}
async function ciReadDownload(downloadToken){
  const auth=memoryDownloadAuth.get(String(downloadToken||''));
  if(!auth||new Date(auth.expiresAt).getTime()<=Date.now())throw problem(401,'DOWNLOAD_AUTH_EXPIRED','ダウンロード認可を確認できません');
  const obj=memoryObjects.get(auth.storageKey);
  if(!obj||obj.state!=='active')throw problem(409,'DOCUMENT_OBJECT_NOT_ACTIVE','有効な原本を確認できません');
  return Buffer.from(obj.bytes)
}
function resetCiStorage(){memoryObjects.clear();memoryUploadAuth.clear();memoryDownloadAuth.clear()}

module.exports={
  providerName,adapterReady,getDocumentStorageAdapter,encryptTicket,decryptTicket,randomStorageKey,
  validateUploadRequest,maxUploadBytes,
  _test:{ciPutObject,ciReadDownload,resetCiStorage}
};
