const crypto=require('crypto');

const ALLOWED_CONTENT_TYPES=['application/pdf','image/jpeg','image/png','image/webp'];
const DEFAULT_MAX_BYTES=20*1024*1024;
const UPLOAD_TTL_MS=10*60*1000;
const DOWNLOAD_TTL_MS=60*1000;
const SCAN_DOWNLOAD_TTL_MS=5*60*1000;

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function sdk(){try{return require('@vercel/blob')}catch(_){throw problem(503,'DOCUMENT_STORAGE_SDK_NOT_AVAILABLE','原本ストレージSDKを利用できません')}}
function providerConfigured(){return process.env.TSUBAME_DOCUMENT_STORAGE_PROVIDER==='vercel_blob'&&Boolean(process.env.BLOB_STORE_ID||process.env.BLOB_READ_WRITE_TOKEN)}
function sanitizeExtension(contentType){return {'application/pdf':'.pdf','image/jpeg':'.jpg','image/png':'.png','image/webp':'.webp'}[contentType]||''}
function validateUploadSpec({contentType,size}){
  const type=String(contentType||'').toLowerCase();
  const bytes=Number(size);
  if(!ALLOWED_CONTENT_TYPES.includes(type))throw problem(422,'DOCUMENT_CONTENT_TYPE_NOT_ALLOWED','PDF/JPEG/PNG/WebPのみ登録できます');
  if(!Number.isFinite(bytes)||bytes<=0||bytes>DEFAULT_MAX_BYTES)throw problem(422,'DOCUMENT_FILE_SIZE_NOT_ALLOWED','原本ファイルサイズを確認してください');
  return {contentType:type,size:bytes}
}
function randomQuarantinePath(contentType){
  const day=new Date().toISOString().slice(0,10).replace(/-/g,'/');
  return 'quarantine/'+day+'/'+crypto.randomUUID()+sanitizeExtension(contentType)
}
async function signedUrl(pathname,operation,{validForMs,allowedContentTypes,maximumSizeInBytes,useCache=false}={}){
  if(!providerConfigured())throw problem(503,'DOCUMENT_STORAGE_NOT_CONFIGURED','Vercel Private Blobが未接続です');
  const {issueSignedToken,presignUrl}=sdk();
  const validUntil=Date.now()+validForMs;
  const token=await issueSignedToken({pathname,operations:[operation],validUntil,allowedContentTypes,maximumSizeInBytes});
  const options={pathname,operation,validUntil,access:'private'};
  if(operation==='put'){options.allowedContentTypes=allowedContentTypes;options.maximumSizeInBytes=maximumSizeInBytes;options.allowOverwrite=false;options.addRandomSuffix=false}
  if(operation==='get')options.useCache=useCache;
  const {presignedUrl}=await presignUrl(token,options);
  return {url:presignedUrl,expires_at:new Date(validUntil).toISOString()}
}
async function issuePrivateUpload({pathname,contentType,size}){
  const spec=validateUploadSpec({contentType,size});
  return signedUrl(pathname,'put',{validForMs:UPLOAD_TTL_MS,allowedContentTypes:[spec.contentType],maximumSizeInBytes:spec.size})
}
async function issuePrivateDownload(pathname){return signedUrl(pathname,'get',{validForMs:DOWNLOAD_TTL_MS,useCache:false})}
async function issuePrivateScanDownload(pathname){return signedUrl(pathname,'get',{validForMs:SCAN_DOWNLOAD_TTL_MS,useCache:false})}
async function headPrivate(pathname){
  if(!providerConfigured())throw problem(503,'DOCUMENT_STORAGE_NOT_CONFIGURED','Vercel Private Blobが未接続です');
  const {head}=sdk();
  try{return await head(pathname,{access:'private'})}catch(err){throw problem(503,'DOCUMENT_STORAGE_HEAD_FAILED','隔離原本を確認できません')}
}
module.exports={ALLOWED_CONTENT_TYPES,DEFAULT_MAX_BYTES,UPLOAD_TTL_MS,DOWNLOAD_TTL_MS,SCAN_DOWNLOAD_TTL_MS,providerConfigured,validateUploadSpec,randomQuarantinePath,issuePrivateUpload,issuePrivateDownload,issuePrivateScanDownload,headPrivate};
