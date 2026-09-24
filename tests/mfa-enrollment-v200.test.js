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
