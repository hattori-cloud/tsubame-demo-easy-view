'use strict';

process.env.TSUBAME_DB_SSL=process.env.TSUBAME_DB_SSL||'disable';

const {backendReadiness}=require('../api/_lib/runtime-config');
const {probeDatabaseReadiness,closePool}=require('../api/_lib/db');

(async()=>{
  const env=backendReadiness();
  const db=env.database_env_present?await probeDatabaseReadiness():{
    connected:false,core_schema_ready:false,audit_append_only_ready:false,capacity_ready:false,
    auth_rate_limit_ready:false,work_import_ready:false
  };
  const blockers=[];
  if(!env.auth_env_present)blockers.push('auth_env');
  if(!env.database_env_present)blockers.push('database_env');
  if(!db.connected)blockers.push('database_connection');
  if(!db.core_schema_ready)blockers.push('database_schema');
  if(!db.audit_append_only_ready)blockers.push('audit_append_only');
  if(!db.capacity_ready)blockers.push('near_miss_capacity');
  if(!db.auth_rate_limit_ready)blockers.push('distributed_login_rate_limit');
  if(!db.work_import_ready)blockers.push('work_import_persistence');
  if(!env.document_storage_env_present)blockers.push('document_storage_env');
  if(!env.document_storage_adapter_ready)blockers.push('document_storage_adapter');
  if(!env.production_business_activation_requested)blockers.push('production_activation_flag');

  const report={
    ok:blockers.length===0&&env.production_business_data_enabled===true,
    environment:env.environment,
    readiness:{
      auth:env.auth_env_present,
      database_connection:db.connected,
      database_schema:db.core_schema_ready,
      audit_append_only:db.audit_append_only_ready,
      near_miss_capacity:db.capacity_ready,
      distributed_login_rate_limit:db.auth_rate_limit_ready,
      work_import_persistence:db.work_import_ready,
      document_storage_env:env.document_storage_env_present,
      document_storage_adapter:env.document_storage_adapter_ready,
      production_activation_requested:env.production_business_activation_requested,
      production_business_data_enabled:env.production_business_data_enabled
    },
    blockers,
    secrets_echoed:false
  };
  console.log(JSON.stringify(report,null,2));
  if(!report.ok)process.exitCode=2
})().catch(err=>{
  console.error(JSON.stringify({ok:false,error:'READINESS_CHECK_FAILED',message:err.message,secrets_echoed:false}));
  process.exitCode=1
}).finally(async()=>{await closePool()});
