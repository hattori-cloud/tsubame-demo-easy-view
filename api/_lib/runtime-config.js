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
function documentStorageEnvPresent(){
  return Boolean(process.env.BLOB_READ_WRITE_TOKEN||process.env.TSUBAME_DOCUMENT_STORAGE_TOKEN)
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
  return Boolean(isProductionRuntime() && productionBusinessActivationRequested() && authEnvPresent() && databaseEnvPresent())
}
function backendReadiness(){
  const auth=authEnvPresent(),mfa=mfaEnvPresent(),db=databaseEnvPresent(),storage=documentStorageEnvPresent(),fixtures=stagingFixturesAllowed();
  return {
    environment:runtimeEnvironment(),
    auth_env_present:auth,
    mfa_env_present:mfa,
    database_env_present:db,
    document_storage_env_present:storage,
    fictional_fixtures_enabled:fixtures,
    auth_probe_ready:auth,
    fictional_registry_ready:auth&&fixtures,
    database_vertical_slice_ready:auth&&db,
    original_file_test_ready:auth&&db&&storage,
    production_business_activation_requested:productionBusinessActivationRequested(),
    production_business_data_enabled:productionBusinessDataEnabled()
  }
}
module.exports={
  runtimeEnvironment,isProductionRuntime,isNonProductionRuntime,
  authEnvPresent,mfaEnvPresent,legacyOidcEnvPresent,databaseEnvPresent,documentStorageEnvPresent,
  stagingFixturesRequested,stagingFixturesAllowed,
  productionBusinessActivationRequested,productionBusinessDataEnabled,backendReadiness
};
