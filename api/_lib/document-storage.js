const crypto=require('crypto');
const {isProductionRuntime,documentStorageTransportReady}=require('./runtime-config');

const CI_PROVIDER='ci-memory';
const VERCEL_PRIVATE_PROVIDER='vercel-blob-private';
const memoryObjects=new Map();
const memoryUploadAuth=new Map();
const memoryDownloadAuth=new Map();
let blobSdkOverride=null;
let fetchOverride=null;

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
      return {...obj,bytes:undefined}
    },
    async readQuarantineForScan(storageKey){
      const obj=memoryObjects.get(storageKey);
      if(!obj||obj.state!=='quarantine')throw problem(409,'DOCUMENT_QUARANTINE_OBJECT_MISSING','隔離中の原本を確認できません');
      return {...obj,bytes:Buffer.from(obj.bytes)}
    },
    async activate(storageKey){
      const obj=memoryObjects.get(storageKey);
      if(!obj||obj.state!=='quarantine')throw problem(409,'DOCUMENT_QUARANTINE_OBJECT_MISSING','隔離中の原本を確認できません');
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
function assertQuarantineKey(storageKey){
  const key=String(storageKey||'');
  if(!/^quarantine\/[0-9a-f]{32}$/.test(key))throw problem(400,'DOCUMENT_STORAGE_KEY_INVALID','原本保存キーを確認できません');
  return key
}
async function blobSdk(){
  if(blobSdkOverride)return blobSdkOverride;
  try{return await import('@vercel/blob')}catch(_){
    throw problem(503,'DOCUMENT_STORAGE_SDK_UNAVAILABLE','private原本ストレージSDKを利用できません')
  }
}
function blobAuthOptions(){
  const token=String(process.env.BLOB_READ_WRITE_TOKEN||process.env.TSUBAME_DOCUMENT_STORAGE_TOKEN||'').trim();
  if(token)return {token};
  const oidcToken=String(process.env.VERCEL_OIDC_TOKEN||'').trim();
  const storeId=String(process.env.TSUBAME_DOCUMENT_BLOB_STORE_ID||'').trim();
  if(oidcToken&&storeId)return {oidcToken,storeId};
  throw problem(503,'DOCUMENT_STORAGE_CREDENTIALS_NOT_CONFIGURED','private原本ストレージ認証が未設定です')
}
function httpFetch(url,options){
  const fn=fetchOverride||globalThis.fetch;
  if(typeof fn!=='function')throw problem(503,'DOCUMENT_STORAGE_FETCH_UNAVAILABLE','private原本ストレージ通信を利用できません');
  return fn(url,options)
}
async function signedBlobUrl(storageKey,operation,{expiresSeconds=60,contentType=null,sizeBytes=null,useCache=false}={}){
  const pathname=assertQuarantineKey(storageKey),sdk=await blobSdk(),validUntil=Date.now()+expiresSeconds*1000;
  const issueOptions={...blobAuthOptions(),pathname,operations:[operation],validUntil};
  if(operation==='put'){
    issueOptions.allowedContentTypes=[contentType];
    issueOptions.maximumSizeInBytes=sizeBytes
  }
  const signed=await sdk.issueSignedToken(issueOptions);
  const signOptions={operation,pathname,access:'private',validUntil};
  if(operation==='put'){
    signOptions.allowedContentTypes=[contentType];
    signOptions.maximumSizeInBytes=sizeBytes;
    signOptions.addRandomSuffix=false;
    signOptions.allowOverwrite=false;
    signOptions.cacheControlMaxAge=0
  }
  if(operation==='get')signOptions.useCache=Boolean(useCache);
  const result=await sdk.presignUrl(signed,signOptions);
  if(!result?.presignedUrl||!/^https:\/\//i.test(String(result.presignedUrl))){
    throw problem(503,'DOCUMENT_STORAGE_SIGNING_FAILED','private原本ストレージの短時間URLを作成できません')
  }
  return {url:String(result.presignedUrl),validUntil}
}
async function readPrivateBlob(storageKey){
  const key=assertQuarantineKey(storageKey);
  const headSigned=await signedBlobUrl(key,'head',{expiresSeconds:60});
  const head=await httpFetch(headSigned.url,{method:'HEAD',redirect:'error',cache:'no-store'});
  if(!head?.ok)throw problem(409,'DOCUMENT_QUARANTINE_OBJECT_MISSING','隔離中の原本を確認できません');
  const contentType=String(head.headers?.get?.('content-type')||'').split(';')[0].trim().toLowerCase();
  const contentLength=Number(head.headers?.get?.('content-length')||0);
  const etag=String(head.headers?.get?.('etag')||'').replace(/^W\//,'').replace(/"/g,'');
  if(!allowedContentTypes().has(contentType))throw problem(409,'DOCUMENT_CONTENT_TYPE_MISMATCH','保存済み原本の形式を確認できません');
  if(!Number.isSafeInteger(contentLength)||contentLength<=0||contentLength>maxUploadBytes()){
    throw problem(409,'DOCUMENT_SIZE_MISMATCH','保存済み原本のサイズを確認できません')
  }
  const getSigned=await signedBlobUrl(key,'get',{expiresSeconds:60,useCache:false});
  const got=await httpFetch(getSigned.url,{method:'GET',redirect:'error',cache:'no-store'});
  if(!got?.ok)throw problem(409,'DOCUMENT_QUARANTINE_OBJECT_MISSING','隔離中の原本を読み込めません');
  const bytes=Buffer.from(await got.arrayBuffer());
  if(bytes.length!==contentLength)throw problem(409,'DOCUMENT_SIZE_MISMATCH','保存済み原本のサイズが一致しません');
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  return {
    storage_key:key,state:'quarantine',content_type:contentType,size_bytes:contentLength,
    sha256,etag:etag||null,malware_status:'pending',malware_scanned_at:null,bytes
  }
}
async function inspectPrivateBlob(storageKey){
  const obj=await readPrivateBlob(storageKey);
  return {...obj,bytes:undefined}
}
function vercelBlobAdapter(){
  if(!documentStorageTransportReady())throw problem(503,'DOCUMENT_STORAGE_ADAPTER_NOT_READY','private原本ストレージ接続を確認できません');
  return {
    name:VERCEL_PRIVATE_PROVIDER,
    async createUploadAuthorization({storageKey,contentType,sizeBytes,expiresSeconds=60}){
      const signed=await signedBlobUrl(storageKey,'put',{expiresSeconds,contentType,sizeBytes});
      return {method:'PUT',upload_url:signed.url,upload_token:null,expires_at:new Date(signed.validUntil).toISOString()}
    },
    async inspectQuarantine(storageKey){return inspectPrivateBlob(storageKey)},
    async readQuarantineForScan(storageKey){return readPrivateBlob(storageKey)},
    async activate(storageKey){
      const inspected=await inspectPrivateBlob(storageKey);
      if(!inspected.etag)throw problem(409,'DOCUMENT_STORAGE_VERSION_MISSING','原本ストレージversionを確認できません');
      return {storage_key:storageKey,version_id:inspected.etag}
    },
    async createDownloadAuthorization({storageKey,expiresSeconds=60}){
      const signed=await signedBlobUrl(storageKey,'get',{expiresSeconds,useCache:false});
      return {download_url:signed.url,expires_at:new Date(signed.validUntil).toISOString()}
    }
  }
}
function getDocumentStorageAdapter(){
  const provider=providerName();
  if(provider===CI_PROVIDER)return ciAdapter();
  if(provider===VERCEL_PRIVATE_PROVIDER)return vercelBlobAdapter();
  throw problem(503,'DOCUMENT_STORAGE_ADAPTER_NOT_READY','承認済みprivate原本ストレージアダプターが未接続です')
}
function adapterReady(){
  if(providerName()===CI_PROVIDER)return !isProductionRuntime()&&String(process.env.TSUBAME_DOCUMENT_TICKET_SECRET||'').length>=32;
  if(providerName()===VERCEL_PRIVATE_PROVIDER)return documentStorageTransportReady();
  return false
}
async function ciPutObject({uploadToken,body,contentType}){
  if(providerName()!==CI_PROVIDER||isProductionRuntime())throw problem(403,'CI_STORAGE_ONLY','CI原本アダプターは非本番専用です');
  const auth=memoryUploadAuth.get(String(uploadToken||''));
  if(!auth||new Date(auth.expiresAt).getTime()<=Date.now())throw problem(401,'UPLOAD_AUTH_EXPIRED','アップロード認可を確認できません');
  const bytes=Buffer.isBuffer(body)?body:Buffer.from(body||[]);
  if(bytes.length!==Number(auth.sizeBytes))throw problem(422,'UPLOAD_SIZE_MISMATCH','アップロードサイズが一致しません');
  if(String(contentType||'').toLowerCase()!==String(auth.contentType))throw problem(422,'UPLOAD_TYPE_MISMATCH','アップロード形式が一致しません');
  const sha256=crypto.createHash('sha256').update(bytes).digest('hex');
  const obj={
    storage_key:auth.storageKey,state:'quarantine',content_type:auth.contentType,size_bytes:bytes.length,
    sha256,malware_status:'pending',malware_scanned_at:null,bytes
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
async function probeDocumentStorageTransport(){
  try{
    const provider=providerName();
    if(provider===CI_PROVIDER)return !isProductionRuntime();
    if(provider!==VERCEL_PRIVATE_PROVIDER||!documentStorageTransportReady())return false;
    const signed=await signedBlobUrl(randomStorageKey(),'head',{expiresSeconds:30});
    return /^https:\/\//i.test(String(signed.url||''))
  }catch(_){return false}
}
function resetCiStorage(){memoryObjects.clear();memoryUploadAuth.clear();memoryDownloadAuth.clear()}
function resetTestOverrides(){blobSdkOverride=null;fetchOverride=null}

module.exports={
  providerName,adapterReady,getDocumentStorageAdapter,probeDocumentStorageTransport,encryptTicket,decryptTicket,randomStorageKey,
  validateUploadRequest,maxUploadBytes,
  _test:{
    ciPutObject,ciReadDownload,resetCiStorage,inspectPrivateBlob,readPrivateBlob,
    setBlobSdk(v){blobSdkOverride=v},setFetch(v){fetchOverride=v},resetTestOverrides
  }
};
