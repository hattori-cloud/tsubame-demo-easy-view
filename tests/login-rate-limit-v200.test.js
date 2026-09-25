const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const login=fs.readFileSync(path.join(__dirname,'..','api','v1','auth','login.js'),'utf8');
const limiter=fs.readFileSync(path.join(__dirname,'..','api','_lib','login-rate-limit.js'),'utf8');
const sql=fs.readFileSync(path.join(__dirname,'..','docs','production-auth-hardening-v200.sql'),'utf8');
const router=fs.readFileSync(path.join(__dirname,'..','api','router.js'),'utf8');

test('login uses distributed limiter before credential lookup and records generic failures',()=>{
  assert.ok(login.includes('loginRateKeys(req,loginId)'));
  assert.ok(login.includes('checkLoginRateLimit(rateKeys)'));
  assert.ok(login.indexOf('checkLoginRateLimit(rateKeys)')<login.indexOf('findCredentialAccount(loginId)'));
  assert.ok(login.includes('recordLoginRateFailure(rateKeys,client)'));
  assert.ok(login.includes("'LOGIN_RATE_LIMITED'"));
  assert.ok(login.includes("'LOGIN_RATE_LIMIT_UNAVAILABLE'"));
});

test('distributed limiter stores only keyed hashes and two approved dimensions',()=>{
  assert.ok(limiter.includes("createHmac('sha256'"));
  assert.ok(limiter.includes("'source:'"));
  assert.ok(limiter.includes("'source_login:'"));
  assert.ok(sql.includes("key_hash char(64) primary key"));
  assert.ok(sql.includes("kind in ('source','source_login')"));
  assert.equal(sql.includes('ip_address'),false);
  assert.equal(sql.includes('login_id text'),false);
});

test('limiter update is atomic and production DB readiness requires it',()=>{
  assert.ok(limiter.includes('on conflict(key_hash) do update'));
  assert.ok(limiter.includes('failure_count=case'));
  assert.ok(router.includes('!dbReady.auth_rate_limit_ready'));
});
