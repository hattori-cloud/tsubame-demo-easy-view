const {applySecurityHeaders,requestId,errorBody}=require('../_lib/security');
const {backendReadiness,isProductionRuntime}=require('../_lib/runtime-config');

module.exports=function handler(req,res){
  const id=requestId(req);
  applySecurityHeaders(res);
  res.setHeader('X-Request-Id',id);

  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json(errorBody('METHOD_NOT_ALLOWED','GETのみ利用できます',id))
  }

  if(isProductionRuntime()){
    return res.status(404).json(errorBody('NOT_FOUND','対象データが見つかりません',id))
  }

  const readiness=backendReadiness();
  const blockers=[];
  if(!readiness.auth_env_present)blockers.push('認証設定');
  if(!readiness.fictional_fixtures_enabled)blockers.push('架空staging利用者台帳');
  if(!readiness.database_env_present)blockers.push('staging DB接続');
  if(!readiness.document_storage_env_present)blockers.push('private原本ストレージ接続');

  return res.status(200).json({
    service:'tsubame-staging-readiness',
    release:'v200',
    environment:readiness.environment,
    readiness:{
      auth_probe_ready:readiness.auth_probe_ready,
      fictional_registry_ready:readiness.fictional_registry_ready,
      database_vertical_slice_ready:readiness.database_vertical_slice_ready,
      original_file_test_ready:readiness.original_file_test_ready
    },
    blockers,
    production_business_data_enabled:false,
    note:'秘密情報の値・接続文字列・保存トークンは返しません'
  })
};
