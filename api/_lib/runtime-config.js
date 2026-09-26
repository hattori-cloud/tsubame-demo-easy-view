function runtimeEnvironment(){
  return String(process.env.VERCEL_ENV||process.env.NODE_ENV||'unknown').toLowerCase()
}
function isProductionRuntime(){
  return runtimeEnvironment()==='production'
}
function isNonProductionRuntime(){
  return !isProductionRuntime()
}
function mfaEnvPresent(){
  try{return Buffer.from(String(process.env.TSUBAME_MFA_ENCRYPTION_KEY||''),'base64').length===32}catch(_){return false}
}
function authEnvPresent(){
  return Boolean(databaseEnvPresent() && String(process.env.TSUBAME_SESSION_SECRET||'').length>=32 && mfaEnvPresent())
}
function legacyOidcEnvPresent(){
  return Boolean(process.env.TSUBAME_AUTH_ISSUER || process.env.TSUBAME_AUTH_AUDIENCE || process.env.TSUBAME_AUTH_JWKS_URL)
}
function databaseEnvPresent(){
  return Boolean(process.env.DATABASE_URL||process.env.TSUBAME_DATABASE_URL)
}
function documentStorageProvider(){
  return String(process.env.TSUBAME_DOCUMENT_STORAGE_PROVIDER||'').trim().toLowerCase()
}
function documentStorageTicketSecretPresent(){
  return String(process.env.TSUBAME_DOCUMENT_TICKET_SECRET||'').length>=32
}
function documentStorageStaticTokenPresent(){
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN||process.env.TSUBAME_DOCUMENT_STORAGE_TOKEN)
}
function documentStorageOidcPresent(){
  return Boolean(process.env.VERCEL_OIDC_TOKEN&&process.env.TSUBAME_DOCUMENT_BLOB_STORE_ID)
}
function documentStorageEnvPresent(){
  const provider=documentStorageProvider();
  if(provider==='ci-memory'&&isNonProductionRuntime())return documentStorageTicketSecretPresent();
  if(provider==='vercel-blob-private')return Boolean(
    documentStorageTicketSecretPresent()&&(documentStorageStaticTokenPresent()||documentStorageOidcPresent())
  );
  return false
}
function documentStorageTransportReady(){
  return documentStorageEnvPresent()
}
function malwareScannerProvider(){
  const explicit=String(process.env.TSUBAME_DOCUMENT_MALWARE_SCANNER_PROVIDER||'').trim().toLowerCase();
  if(explicit)return explicit;
  if(documentStorageProvider()==='ci-memory'&&isNonProductionRuntime())return 'ci-memory';
  return ''
}
function malwareScannerEndpointValid(){
  try{
    const u=new URL(String(process.env.TSUBAME_DOCUMENT_MALWARE_SCANNER_URL||''));
    return u.protocol==='https:'&&Boolean(u.hostname)&&!u.username&&!u.password&&!u.search&&!u.hash
  }catch(_){return false}
}
function documentMalwareScannerReady(){
  const provider=malwareScannerProvider();
  if(provider==='ci-memory')return isNonProductionRuntime();
  if(provider!=='private-https')return false;
  return Boolean(
    process.env.TSUBAME_DOCUMENT_MALWARE_SCANNER_APPROVED==='1' &&
    malwareScannerEndpointValid() &&
    String(process.env.TSUBAME_DOCUMENT_MALWARE_SCANNER_TOKEN||'').length>=32
  )
}
function documentStorageAdapterReady(){
  return documentStorageTransportReady()
}
function originalDocumentPipelineReady(){
  return Boolean(documentStorageTransportReady()&&documentMalwareScannerReady())
}
function stagingFixturesRequested(){
  return process.env.TSUBAME_ENABLE_STAGING_FIXTURES==='1'
}
function stagingFixturesAllowed(){
  return stagingFixturesRequested() && isNonProductionRuntime()
}
function productionBusinessActivationRequested(){
  return process.env.TSUBAME_ENABLE_PRODUCTION_BUSINESS_DATA==='1'
}
function productionBusinessDataEnabled(){
  return Boolean(
    isProductionRuntime() && productionBusinessActivationRequested() &&
    authEnvPresent() && databaseEnvPresent() && originalDocumentPipelineReady()
  )
}
function backendReadiness(){
  const auth=authEnvPresent(),mfa=mfaEnvPresent(),db=databaseEnvPresent();
  const storage=documentStorageEnvPresent(),storageTransport=documentStorageTransportReady();
  const malwareScanner=documentMalwareScannerReady(),originalPipeline=originalDocumentPipelineReady();
  const fixtures=stagingFixturesAllowed();
  return {
    environment:runtimeEnvironment(),
    auth_env_present:auth,
    mfa_env_present:mfa,
    database_env_present:db,
    document_storage_env_present:storage,
    document_storage_transport_ready:storageTransport,
    document_storage_adapter_ready:storageTransport,
    document_malware_scanner_ready:malwareScanner,
    original_document_pipeline_ready:originalPipeline,
    fictional_fixtures_enabled:fixtures,
    auth_probe_ready:auth,
    fictional_registry_ready:auth&&fixtures,
    database_vertical_slice_ready:auth&&db,
    original_file_test_ready:auth&&db&&originalPipeline,
    production_business_activation_requested:productionBusinessActivationRequested(),
    production_business_data_enabled:productionBusinessDataEnabled()
  }
}
module.exports={
  runtimeEnvironment,isProductionRuntime,isNonProductionRuntime,
  authEnvPresent,mfaEnvPresent,legacyOidcEnvPresent,databaseEnvPresent,
  documentStorageProvider,documentStorageTicketSecretPresent,documentStorageStaticTokenPresent,documentStorageOidcPresent,
  documentStorageEnvPresent,documentStorageTransportReady,documentStorageAdapterReady,
  malwareScannerProvider,malwareScannerEndpointValid,documentMalwareScannerReady,originalDocumentPipelineReady,
  stagingFixturesRequested,stagingFixturesAllowed,
  productionBusinessActivationRequested,productionBusinessDataEnabled,backendReadiness
};
