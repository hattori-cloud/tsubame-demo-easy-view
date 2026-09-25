const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const limiter=fs.readFileSync(path.join(__dirname,'..','api','_lib','login-rate-limit.js'),'utf8');
const login=fs.readFileSync(path.join(__dirname,'..','api','v1','auth','login.js'),'utf8');
const schema=fs.readFileSync(path.join(__dirname,'..','docs','production-schema.sql'),'utf8');

test('distributed login limiter persists shared state in PostgreSQL',()=>{
  assert.ok(limiter.includes('insert into login_rate_limits'));
  assert.ok(limiter.includes('on conflict (key_hash) do update'));
  assert.ok(limiter.includes("createHmac('sha256'"));
  assert.ok(limiter.includes('SOURCE_LOGIN_THRESHOLD=10'));
  assert.ok(limiter.includes('SOURCE_THRESHOLD=30'));
  assert.ok(schema.includes('create table login_rate_limits'));
});

test('login checks shared limiter before account lookup and records unknown-account failures',()=>{
  assert.ok(login.indexOf('await assertLoginAllowed(rateKeys)')<login.indexOf('findCredentialAccount(loginId)'));
  assert.ok(login.includes('if(!account){'));
  assert.ok(login.includes('recordNetworkLoginFailure(rateKeys)'));
  assert.ok(login.includes("'RATE_LIMIT_UNAVAILABLE'"));
  assert.ok(login.includes("'LOGIN_RATE_LIMITED'"));
});

test('distributed limiter events are audited without raw network source',()=>{
  assert.ok(login.includes("action:'login_rate_limited'"));
  assert.ok(login.includes("action:'login_rate_limit_reached'"));
  assert.equal(login.includes('x-forwarded-for'),false);
  assert.equal(login.includes('x-real-ip'),false);
});

test('rate limiter source derivation stays outside the audit payload',()=>{
  assert.ok(limiter.includes("req?.headers?.['x-forwarded-for']"));
  assert.ok(limiter.includes("req?.headers?.['x-real-ip']"));
  assert.ok(limiter.includes("hmac('source:'"));
  assert.ok(limiter.includes("hmac('login:'"));
});
