const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

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
  assert.ok(health.includes('business_api_enabled:false'));
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
