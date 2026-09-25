const {applySecurityHeaders,requestId,errorBody}=require('../_lib/security');
const {backendReadiness,isProductionRuntime}=require('../_lib/runtime-config');
const {probeDatabaseReadiness}=require('../_lib/db');

module.exports=async function handler(req,res){
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
  const dbProbe=readiness.database_env_present?await probeDatabaseReadiness():{connected:false,core_schema_ready:false,audit_append_only_ready:false,capacity_ready:false};
  const databaseReady=Boolean(readiness.auth_env_present&&dbProbe.connected&&dbProbe.core_schema_ready&&dbProbe.audit_append_only_ready);
  const blockers=[];
  if(!readiness.auth_env_present)blockers.push('認証設定');
  if(!readiness.fictional_fixtures_enabled)blockers.push('架空staging利用者台帳');
  if(!readiness.database_env_present)blockers.push('staging DB接続設定');
  else if(!dbProbe.connected)blockers.push('staging DB実接続');
  else{
    if(!dbProbe.core_schema_ready)blockers.push('本番候補DBスキーマ');
    if(!dbProbe.audit_append_only_ready)blockers.push('監査追記専用DB保護');
    if(!dbProbe.capacity_ready)blockers.push('月次ヒヤリ集計DB構造')
  }
  if(!readiness.document_storage_env_present)blockers.push('private原本ストレージ接続');
  if(!readiness.document_storage_adapter_ready)blockers.push('private原本ストレージ実アダプター');

  return res.status(200).json({
    service:'tsubame-staging-readiness',
    release:'v200',
    environment:readiness.environment,
    readiness:{
      auth_probe_ready:readiness.auth_probe_ready,
      fictional_registry_ready:readiness.fictional_registry_ready,
      database_connection_ready:dbProbe.connected,
      database_schema_ready:dbProbe.core_schema_ready,
      database_audit_guard_ready:dbProbe.audit_append_only_ready,
      database_capacity_ready:dbProbe.capacity_ready,
      database_vertical_slice_ready:databaseReady,
      document_storage_adapter_ready:readiness.document_storage_adapter_ready,
      original_file_test_ready:Boolean(readiness.original_file_test_ready&&databaseReady)
    },
    blockers,
    production_business_data_enabled:false,
    note:'秘密情報の値・接続文字列・保存トークンは返しません'
  })
};
