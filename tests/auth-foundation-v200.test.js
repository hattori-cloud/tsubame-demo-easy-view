const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const auth=fs.readFileSync(path.join(__dirname,'..','api','_lib','auth.js'),'utf8');
const runtime=fs.readFileSync(path.join(__dirname,'..','api','_lib','runtime-config.js'),'utf8');
const login=fs.readFileSync(path.join(__dirname,'..','api','v1','auth','login.js'),'utf8');
const contract=fs.readFileSync(path.join(__dirname,'..','docs','api-contract.md'),'utf8');

test('protected API foundation uses server-side sessions rather than legacy OIDC JWT verification',()=>{
  assert.ok(auth.includes('tsubame_session'));
  assert.ok(auth.includes('tokenHash(token)'));
  assert.ok(auth.includes('SESSION_STORE_NOT_CONFIGURED'));
  assert.equal(auth.includes('JWKS'),false);
  assert.equal(auth.includes('RS256'),false);
  assert.equal(auth.includes('TSUBAME_AUTH_ISSUER'),false);
  assert.ok(runtime.includes('TSUBAME_SESSION_SECRET'));
});

test('login route is fail closed until credential and session stores are connected',()=>{
  assert.ok(login.includes('login_id'));
  assert.ok(login.includes('employee_no'));
  assert.ok(login.includes('password'));
  assert.ok(login.includes('CREDENTIAL_STORE_NOT_CONFIGURED'));
  assert.ok(login.includes('Argon2id-equivalent verification'));
  assert.equal(login.includes('console.log'),false);
});

test('session contract stores only hashes and supports revocation',()=>{
  assert.match(contract,/database stores only `auth_sessions\.token_hash`/);
  assert.match(contract,/revokes every non-revoked `auth_sessions` row/);
  assert.match(contract,/Password-reset and MFA challenge values are also stored only as hashes/);
});
