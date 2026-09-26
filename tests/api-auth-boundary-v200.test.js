const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const network=require('../api/_lib/network-access');

const root=path.join(__dirname,'..','api','v1');

function walk(dir){
  const out=[];
  for(const name of fs.readdirSync(dir)){
    const p=path.join(dir,name),st=fs.statSync(p);
    if(st.isDirectory())out.push(...walk(p));
    else if(st.isFile()&&p.endsWith('.js'))out.push(p);
  }
  return out
}

function rel(p){return path.relative(path.join(__dirname,'..'),p).split(path.sep).join('/')}

const TOKEN_AUTH_ROUTES=new Set([
  'api/v1/auth/login.js',
  'api/v1/auth/mfa/enroll/start.js',
  'api/v1/auth/mfa/enroll/complete.js',
  'api/v1/auth/mfa/verify.js',
  'api/v1/auth/password/reset/complete.js'
]);

const PUBLIC_NON_BUSINESS_ROUTES=new Set([
  'api/v1/health.js',
  'api/v1/staging-readiness.js'
]);

test('every v1 business route has request authentication unless explicitly token-auth or non-business public',()=>{
  const files=walk(root);
  const unexpected=[];
  for(const file of files){
    const r=rel(file),source=fs.readFileSync(file,'utf8');
    if(source.includes('authenticateRequest'))continue;
    if(TOKEN_AUTH_ROUTES.has(r))continue;
    if(PUBLIC_NON_BUSINESS_ROUTES.has(r))continue;
    unexpected.push(r);
  }
  assert.deepEqual(unexpected,[]);
});

test('public non-business routes cannot expose employee or database records',()=>{
  const health=fs.readFileSync(path.join(root,'health.js'),'utf8');
  const readiness=fs.readFileSync(path.join(root,'staging-readiness.js'),'utf8');
  assert.ok(health.includes('business_api_enabled:readiness.production_business_data_enabled'));
  assert.equal(/from\s+employees|select\s+.*employees/i.test(health),false);
  assert.ok(readiness.includes('isProductionRuntime()'));
  assert.ok(readiness.includes('status(404)'));
  assert.equal(readiness.includes('employeeForUser'),false);
});

test('token-auth routes must use opaque hashed challenge or credential verification paths',()=>{
  const login=fs.readFileSync(path.join(root,'auth','login.js'),'utf8');
  const verify=fs.readFileSync(path.join(root,'auth','mfa','verify.js'),'utf8');
  const enrollStart=fs.readFileSync(path.join(root,'auth','mfa','enroll','start.js'),'utf8');
  const enrollComplete=fs.readFileSync(path.join(root,'auth','mfa','enroll','complete.js'),'utf8');
  const resetComplete=fs.readFileSync(path.join(root,'auth','password','reset','complete.js'),'utf8');
  assert.ok(login.includes('verify(account.password_hash,password)'));
  for(const source of [verify,enrollStart,enrollComplete,resetComplete])assert.ok(source.includes('tokenHash('));
  for(const source of [verify,enrollComplete])assert.ok(source.includes('SESSION_NOT_ALLOWED'));
});


test('single router blocks every production API except health until explicit activation',()=>{
  const router=fs.readFileSync(path.join(__dirname,'..','api','router.js'),'utf8');
  assert.ok(router.includes('isProductionRuntime()'));
  assert.ok(router.includes("path!=='/health'"));
  assert.ok(router.includes('!productionBusinessDataEnabled()'));
  assert.ok(router.includes('probeDatabaseReadiness()'));
  assert.ok(router.includes('!dbReady.connected'));
  assert.ok(router.includes('!dbReady.core_schema_ready'));
  assert.ok(router.includes('!dbReady.audit_append_only_ready'));
  assert.ok(router.includes('!dbReady.capacity_ready'));
  assert.ok(router.includes('!dbReady.auth_rate_limit_ready'));
  assert.ok(router.includes('!dbReady.work_import_ready'));
  assert.ok(router.includes('!dbReady.runtime_role_ready'));
  assert.ok(router.includes("'PRODUCTION_NOT_ACTIVATED'"));
  assert.ok(router.includes("'PRODUCTION_DATABASE_NOT_READY'"));
});


test('production network gate allows only configured office LAN or corporate Wi-Fi egress CIDRs',()=>{
  const old=process.env.TSUBAME_INTERNAL_NETWORK_CIDRS;
  try{
    process.env.TSUBAME_INTERNAL_NETWORK_CIDRS='203.0.113.0/24,198.51.100.44/32';
    assert.equal(network.requestFromInternalNetwork({headers:{'x-forwarded-for':'203.0.113.10'}}),true);
    assert.equal(network.requestFromInternalNetwork({headers:{'x-forwarded-for':'198.51.100.44'}}),true);
    assert.equal(network.requestFromInternalNetwork({headers:{'x-forwarded-for':'192.0.2.9'}}),false);
    assert.equal(network.requestFromInternalNetwork({headers:{}}),false);
  }finally{
    if(old===undefined)delete process.env.TSUBAME_INTERNAL_NETWORK_CIDRS;
    else process.env.TSUBAME_INTERNAL_NETWORK_CIDRS=old
  }
});

test('single router hides production health and business APIs outside internal network',()=>{
  const router=fs.readFileSync(path.join(__dirname,'..','api','router.js'),'utf8');
  assert.ok(router.includes('requestFromInternalNetwork'));
  assert.ok(router.indexOf('requestFromInternalNetwork(req)')<router.indexOf("path!=='/health'"));
  assert.ok(router.includes("return res.status(404).json(errorBody('NOT_FOUND'"));
});
