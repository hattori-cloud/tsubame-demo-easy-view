const crypto=require('crypto');

function mfaProblem(code,message){const e=new Error(message);e.status=503;e.code=code;return e}
function encryptionKey(){
  const raw=String(process.env.TSUBAME_MFA_ENCRYPTION_KEY||'');
  let key;
  try{key=Buffer.from(raw,'base64')}catch(_){key=Buffer.alloc(0)}
  if(key.length!==32)throw mfaProblem('MFA_KEY_NOT_CONFIGURED','MFA暗号化鍵が未設定です');
  return key
}
function encryptSecret(secret){
  const iv=crypto.randomBytes(12),cipher=crypto.createCipheriv('aes-256-gcm',encryptionKey(),iv);
  const ciphertext=Buffer.concat([cipher.update(String(secret),'utf8'),cipher.final()]);
  return {ciphertext:ciphertext.toString('base64'),iv:iv.toString('base64'),tag:cipher.getAuthTag().toString('base64')}
}
function decryptSecret(material){
  if(!material?.mfa_secret_ciphertext||!material?.mfa_secret_iv||!material?.mfa_secret_tag)throw mfaProblem('MFA_NOT_ENROLLED','MFAが未登録です');
  try{
    const decipher=crypto.createDecipheriv('aes-256-gcm',encryptionKey(),Buffer.from(material.mfa_secret_iv,'base64'));
    decipher.setAuthTag(Buffer.from(material.mfa_secret_tag,'base64'));
    return Buffer.concat([decipher.update(Buffer.from(material.mfa_secret_ciphertext,'base64')),decipher.final()]).toString('utf8')
  }catch(_){throw mfaProblem('MFA_SECRET_INVALID','MFA秘密情報を復号できません')}
}
const B32='ABCDEFGHIJKLMNOPQRSTUVWXYZ234567';
function base32Encode(buffer){
  let bits=0,value=0,out='';
  for(const byte of buffer){value=(value<<8)|byte;bits+=8;while(bits>=5){out+=B32[(value>>>(bits-5))&31];bits-=5}}
  if(bits>0)out+=B32[(value<<(5-bits))&31];
  return out
}
function base32Decode(text){
  const clean=String(text||'').toUpperCase().replace(/=+$/,'').replace(/[^A-Z2-7]/g,'');
  let bits=0,value=0,bytes=[];
  for(const ch of clean){const idx=B32.indexOf(ch);if(idx<0)continue;value=(value<<5)|idx;bits+=5;if(bits>=8){bytes.push((value>>>(bits-8))&255);bits-=8}}
  return Buffer.from(bytes)
}
function totpCode(secret,timeStep){
  const key=base32Decode(secret),counter=Buffer.alloc(8);counter.writeBigUInt64BE(BigInt(timeStep));
  const digest=crypto.createHmac('sha1',key).update(counter).digest(),offset=digest[digest.length-1]&15;
  const n=(digest.readUInt32BE(offset)&0x7fffffff)%1000000;
  return String(n).padStart(6,'0')
}
function verifyTotp(secret,code,now=Date.now()){
  const normalized=String(code||'').trim();if(!/^\d{6}$/.test(normalized))return false;
  const step=Math.floor(now/30000);
  return [-1,0,1].some(delta=>{const expected=totpCode(secret,step+delta);return crypto.timingSafeEqual(Buffer.from(expected),Buffer.from(normalized))})
}
function generateTotpEnrollment(loginId){
  const secret=base32Encode(crypto.randomBytes(20));
  const label=encodeURIComponent('つばめ交通:'+String(loginId));
  const uri=`otpauth://totp/${label}?secret=${secret}&issuer=${encodeURIComponent('つばめ交通')}&algorithm=SHA1&digits=6&period=30`;
  return {secret,uri,...encryptSecret(secret)}
}
module.exports={encryptSecret,decryptSecret,verifyTotp,generateTotpEnrollment,base32Encode,base32Decode,totpCode};
