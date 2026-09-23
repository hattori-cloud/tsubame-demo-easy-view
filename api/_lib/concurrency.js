function apiProblem(status,code,message){
  const err=new Error(message);
  err.status=status;
  err.code=code;
  return err
}
function normalizeVersion(value){
  const n=Number.parseInt(String(value),10);
  return Number.isSafeInteger(n)&&n>=0?n:null
}
function formatVersionEtag(version){
  const n=normalizeVersion(version);
  if(n===null)throw apiProblem(500,'INVALID_RESOURCE_VERSION','リソースのバージョンが不正です');
  return '"'+n+'"'
}
function parseIfMatchHeader(raw){
  const value=Array.isArray(raw)?raw[0]:raw;
  if(value===undefined||value===null||String(value).trim()===''){
    throw apiProblem(428,'PRECONDITION_REQUIRED','更新には If-Match ヘッダーが必要です')
  }
  const text=String(value).trim();
  if(text==='*')throw apiProblem(400,'INVALID_IF_MATCH','If-Match の * は利用できません');
  if(/^W\//i.test(text))throw apiProblem(400,'WEAK_ETAG_NOT_ALLOWED','更新には強い ETag を指定してください');
  const m=/^"([0-9]+)"$/.exec(text);
  if(!m)throw apiProblem(400,'INVALID_IF_MATCH','If-Match は GET で返された ETag をそのまま指定してください');
  const version=normalizeVersion(m[1]);
  if(version===null)throw apiProblem(400,'INVALID_IF_MATCH','If-Match のバージョンが不正です');
  return version
}
function requireVersionMatch(req,currentVersion){
  const supplied=parseIfMatchHeader(req?.headers?.['if-match']);
  const current=normalizeVersion(currentVersion);
  if(current===null)throw apiProblem(500,'INVALID_RESOURCE_VERSION','現在のリソースバージョンが不正です');
  if(supplied!==current){
    throw apiProblem(409,'VERSION_CONFLICT','別の利用者が先に更新しています。最新データを読み直してください')
  }
  return current
}
function setVersionEtag(res,version){
  res.setHeader('ETag',formatVersionEtag(version));
  return res
}
module.exports={normalizeVersion,formatVersionEtag,parseIfMatchHeader,requireVersionMatch,setVersionEtag};
