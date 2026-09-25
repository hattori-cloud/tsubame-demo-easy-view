const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

process.env.TSUBAME_MFA_ENCRYPTION_KEY=Buffer.alloc(32,11).toString('base64');
const mfa=require('../api/_lib/mfa');

test('MFA secret encryption round-trips with AES-GCM material only',()=>{
  const secret='JBSWY3DPEHPK3PXP';
  const enc=mfa.encryptSecret(secret);
  assert.notEqual(enc.ciphertext,secret);
  assert.ok(enc.iv);
  assert.ok(enc.tag);
  assert.equal(mfa.decryptSecret({
    mfa_secret_ciphertext:enc.ciphertext,
    mfa_secret_iv:enc.iv,
    mfa_secret_tag:enc.tag
  }),secret);
});

test('TOTP accepts current step and neighboring clock-drift step only',()=>{
  const secret='JBSWY3DPEHPK3PXP';
  const step=1900000000;
  const code=mfa.totpCode(secret,step);
  assert.equal(mfa.verifyTotp(secret,code,step*30000),true);
  assert.equal(mfa.verifyTotp(secret,'000000',step*30000),code==='000000');
  const far=mfa.totpCode(secret,step+4);
  assert.equal(mfa.verifyTotp(secret,far,step*30000),false);
});

test('login distinguishes MFA enrollment from normal verification',()=>{
  const login=fs.readFileSync(path.join(__dirname,'..','api','v1','auth','login.js'),'utf8');
  assert.ok(login.includes("purpose:account.mfa_enrolled_at?'verify':'enroll'"));
  assert.ok(login.includes('mfa_enrollment_required:!account.mfa_enrolled_at'));
});

test('MFA enrollment uses a primary-auth challenge and commits only after TOTP verification',()=>{
  const start=fs.readFileSync(path.join(__dirname,'..','api','v1','auth','mfa','enroll','start.js'),'utf8');
  const complete=fs.readFileSync(path.join(__dirname,'..','api','v1','auth','mfa','enroll','complete.js'),'utf8');
  assert.ok(start.includes("challenge.purpose!=='enroll'"));
  assert.ok(start.includes('setMfaPendingSecret'));
  assert.ok(complete.includes("challenge.purpose!=='enroll'"));
  assert.ok(complete.includes('verifyTotp'));
  assert.ok(complete.includes('enrollUserMfa'));
  assert.ok(complete.includes('createSession'));
});


test('MFA verify and enrollment consume the challenge before session issuance',()=>{
  const store=fs.readFileSync(path.join(__dirname,'..','api','_lib','auth-store.js'),'utf8');
  const verify=fs.readFileSync(path.join(__dirname,'..','api','v1','auth','mfa','verify.js'),'utf8');
  const complete=fs.readFileSync(path.join(__dirname,'..','api','v1','auth','mfa','enroll','complete.js'),'utf8');
  assert.ok(store.includes('verified_at is null and expires_at>now() and failed_attempts<5 returning id'));
  for(const source of [verify,complete]){
    assert.ok(source.includes('MFA_CHALLENGE_CONSUMED'));
    assert.ok(source.indexOf('markMfaVerified(challenge.id,client)')<source.indexOf('createSession({userId:challenge.user_id'));
  }
});


test('MFA enrollment start rejects ineligible accounts and does not overwrite a pending secret',()=>{
  const start=fs.readFileSync(path.join(__dirname,'..','api','v1','auth','mfa','enroll','start.js'),'utf8');
  const store=fs.readFileSync(path.join(__dirname,'..','api','_lib','auth-store.js'),'utf8');
  assert.ok(start.includes("account.state!=='active'"));
  assert.ok(start.includes("account.employee_lifecycle_status==='retired'"));
  assert.ok(start.includes('locked'));
  assert.ok(start.includes('const saved=await setMfaPendingSecret'));
  assert.ok(start.includes('const current=await getMfaChallenge'));
  assert.ok(store.includes('pending_secret_ciphertext is null'));
  assert.ok(store.includes('expires_at>now()'));
});


test('password reset and password change invalidate pending MFA enrollment challenges',()=>{
  const users=fs.readFileSync(path.join(__dirname,'..','api','_lib','user-store.js'),'utf8');
  const change=fs.readFileSync(path.join(__dirname,'..','api','v1','auth','password','change.js'),'utf8');
  assert.ok((users.match(/update mfa_challenges set verified_at=now\(\) where user_id=\$1 and verified_at is null/g)||[]).length>=2);
  assert.ok(change.includes('update mfa_challenges set verified_at=now()'));
  assert.ok(change.includes('update password_reset_tokens set used_at=now()'));
  assert.ok(change.indexOf("select id from users where id=$1 for update")<change.indexOf('update mfa_challenges set verified_at=now()'));
});

test('first-time MFA enrollment is user-single-use, not merely challenge-single-use',()=>{
  const store=fs.readFileSync(path.join(__dirname,'..','api','_lib','auth-store.js'),'utf8');
  const complete=fs.readFileSync(path.join(__dirname,'..','api','v1','auth','mfa','enroll','complete.js'),'utf8');
  const start=fs.readFileSync(path.join(__dirname,'..','api','v1','auth','mfa','enroll','start.js'),'utf8');
  assert.ok(store.includes('where id=$1 and mfa_enrolled_at is null'));
  assert.ok(complete.includes("findCredentialAccountById(challenge.user_id,client,{forUpdate:true})"));
  assert.ok(complete.includes('MFA_ALREADY_ENROLLED'));
  assert.ok(complete.includes("purpose:'enroll'"));
  assert.ok(start.includes('account.mfa_enrolled_at'));
});
