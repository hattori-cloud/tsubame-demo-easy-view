const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const runtime=require('../api/_lib/runtime-config');
const registry=require('../api/_fixtures/staging-registry');

function envSnapshot(){
  return {
    VERCEL_ENV:process.env.VERCEL_ENV,
    NODE_ENV:process.env.NODE_ENV,
    TSUBAME_ENABLE_STAGING_FIXTURES:process.env.TSUBAME_ENABLE_STAGING_FIXTURES,
    TSUBAME_AUTH_ISSUER:process.env.TSUBAME_AUTH_ISSUER,
    TSUBAME_AUTH_AUDIENCE:process.env.TSUBAME_AUTH_AUDIENCE,
    TSUBAME_AUTH_JWKS_URL:process.env.TSUBAME_AUTH_JWKS_URL,
    TSUBAME_SESSION_SECRET:process.env.TSUBAME_SESSION_SECRET,
    TSUBAME_MFA_ENCRYPTION_KEY:process.env.TSUBAME_MFA_ENCRYPTION_KEY,
    DATABASE_URL:process.env.DATABASE_URL,
    TSUBAME_DATABASE_URL:process.env.TSUBAME_DATABASE_URL,
    BLOB_READ_WRITE_TOKEN:process.env.BLOB_READ_WRITE_TOKEN,
    TSUBAME_DOCUMENT_STORAGE_TOKEN:process.env.TSUBAME_DOCUMENT_STORAGE_TOKEN
  }
}
function restoreEnv(saved){
  for(const [k,v] of Object.entries(saved)){
    if(v===undefined)delete process.env[k];
    else process.env[k]=v
  }
}

test('fictional staging fixtures can never be enabled in production',()=>{
  const saved=envSnapshot();
  try{
    process.env.VERCEL_ENV='production';
    process.env.TSUBAME_ENABLE_STAGING_FIXTURES='1';
    assert.equal(runtime.stagingFixturesAllowed(),false);
    assert.equal(registry.fixturesEnabled(),false)
  }finally{restoreEnv(saved)}
});

test('fictional fixtures require explicit flag in non-production',()=>{
  const saved=envSnapshot();
  try{
    process.env.VERCEL_ENV='preview';
    delete process.env.TSUBAME_ENABLE_STAGING_FIXTURES;
    assert.equal(runtime.stagingFixturesAllowed(),false);
    process.env.TSUBAME_ENABLE_STAGING_FIXTURES='1';
    assert.equal(runtime.stagingFixturesAllowed(),true);
    assert.equal(registry.fixturesEnabled(),true)
  }finally{restoreEnv(saved)}
});

test('backend readiness reports booleans without secret values',()=>{
  const saved=envSnapshot();
  try{
    process.env.VERCEL_ENV='preview';
    process.env.TSUBAME_ENABLE_STAGING_FIXTURES='1';
    process.env.TSUBAME_AUTH_ISSUER='https://issuer.example.invalid';
    process.env.TSUBAME_AUTH_AUDIENCE='secret-audience-value';
    process.env.TSUBAME_AUTH_JWKS_URL='https://issuer.example.invalid/jwks';
    process.env.DATABASE_URL='postgres://secret-user:secret-password@example.invalid/db';
    process.env.TSUBAME_SESSION_SECRET='secret-session-signing-value-32chars-plus';
    process.env.TSUBAME_MFA_ENCRYPTION_KEY=Buffer.alloc(32,7).toString('base64');
    process.env.BLOB_READ_WRITE_TOKEN='secret-storage-token';
    const readiness=runtime.backendReadiness();
    assert.equal(readiness.auth_env_present,true);
    assert.equal(readiness.mfa_env_present,true);
    assert.equal(readiness.database_env_present,true);
    assert.equal(readiness.document_storage_env_present,true);
    assert.equal(readiness.fictional_fixtures_enabled,true);
    assert.equal(readiness.original_file_test_ready,true);
    const serialized=JSON.stringify(readiness);
    assert.equal(serialized.includes('secret-password'),false);
    assert.equal(serialized.includes('secret-storage-token'),false);
    assert.equal(serialized.includes('secret-audience-value'),false);
    assert.equal(serialized.includes('secret-session-signing-value-32chars-plus'),false)
  }finally{restoreEnv(saved)}
});

test('v200 health and secure probe do not return business records',()=>{
  const health=fs.readFileSync(path.join(__dirname,'..','api','v1','health.js'),'utf8');
  const probe=fs.readFileSync(path.join(__dirname,'..','api','v1','secure-probe.js'),'utf8');
  assert.ok(health.includes("release:'v200'"));
  assert.ok(health.includes("business_api_enabled:false"));
  assert.ok(probe.includes("business_data_returned:false"));
  assert.equal(probe.includes('resolveCurrentUser'),false);
  assert.equal(probe.includes('employee'),false)
});

test('staging readiness route is hidden in production and never returns secret env values',()=>{
  const source=fs.readFileSync(path.join(__dirname,'..','api','v1','staging-readiness.js'),'utf8');
  assert.ok(source.includes('isProductionRuntime()'));
  assert.ok(source.includes("status(404)"));
  assert.ok(source.includes('秘密情報の値・接続文字列・保存トークンは返しません'));
  assert.equal(source.includes('process.env.DATABASE_URL'),false);
  assert.equal(source.includes('process.env.BLOB_READ_WRITE_TOKEN'),false)
});


test('staging readiness verifies live database state instead of trusting env presence',()=>{
  const route=fs.readFileSync(path.join(__dirname,'..','api','v1','staging-readiness.js'),'utf8');
  const db=fs.readFileSync(path.join(__dirname,'..','api','_lib','db.js'),'utf8');
  assert.ok(route.includes('probeDatabaseReadiness'));
  assert.ok(route.includes('database_connection_ready'));
  assert.ok(route.includes('database_schema_ready'));
  assert.ok(route.includes('database_audit_guard_ready'));
  assert.ok(route.includes('database_capacity_ready'));
  assert.ok(db.includes("to_regclass('public.employees')"));
  assert.ok(db.includes("audit_logs_append_only_guard"));
  assert.ok(db.includes("record_histories_append_only_guard"));
  assert.ok(db.includes("to_regclass('public.near_miss_monthly_compliance')"));
});


test('legacy OIDC variables alone do not mark credential-session auth as ready',()=>{
  const saved=envSnapshot();
  try{
    process.env.VERCEL_ENV='preview';
    delete process.env.DATABASE_URL;
    delete process.env.TSUBAME_DATABASE_URL;
    delete process.env.TSUBAME_SESSION_SECRET;
    delete process.env.TSUBAME_MFA_ENCRYPTION_KEY;
    process.env.TSUBAME_AUTH_ISSUER='https://issuer.example.invalid';
    process.env.TSUBAME_AUTH_AUDIENCE='aud';
    process.env.TSUBAME_AUTH_JWKS_URL='https://issuer.example.invalid/jwks';
    assert.equal(runtime.legacyOidcEnvPresent(),true);
    assert.equal(runtime.authEnvPresent(),false);
  }finally{restoreEnv(saved)}
});
