const net=require('node:net');
const crypto=require('crypto');

function configuredCidrs(){
  return String(process.env.TSUBAME_INTERNAL_NETWORK_CIDRS||'')
    .split(',').map(x=>x.trim()).filter(Boolean)
}
function internalNetworkConfigured(){return configuredCidrs().length>0}
function normalizeIp(value){
  let s=String(value||'').trim();
  if(!s)return '';
  if(s.startsWith('[')&&s.includes(']'))s=s.slice(1,s.indexOf(']'));
  if(/^::ffff:\d+\.\d+\.\d+\.\d+$/i.test(s))s=s.slice(7);
  return s
}
function ipv4Value(ip){
  const parts=String(ip).split('.');
  if(parts.length!==4)return null;
  let out=0n;
  for(const part of parts){
    if(!/^\d{1,3}$/.test(part))return null;
    const n=Number(part);if(n<0||n>255)return null;
    out=(out<<8n)|BigInt(n)
  }
  return out
}
function ipv6Value(ip){
  const raw=String(ip).toLowerCase();
  if(raw.includes('.')){
    const pos=raw.lastIndexOf(':');
    const v4=ipv4Value(raw.slice(pos+1));
    if(v4===null)return null;
    const hi=((v4>>16n)&0xffffn).toString(16),lo=(v4&0xffffn).toString(16);
    return ipv6Value(raw.slice(0,pos)+':'+hi+':'+lo)
  }
  const pieces=raw.split('::');
  if(pieces.length>2)return null;
  const left=pieces[0]?pieces[0].split(':'):[];
  const right=pieces.length===2&&pieces[1]?pieces[1].split(':'):[];
  if(pieces.length===1&&left.length!==8)return null;
  const missing=8-left.length-right.length;
  if(missing<0||(pieces.length===2&&missing<1))return null;
  const groups=[...left,...Array(missing).fill('0'),...right];
  if(groups.length!==8)return null;
  let out=0n;
  for(const g of groups){
    if(!/^[0-9a-f]{1,4}$/.test(g))return null;
    out=(out<<16n)|BigInt(parseInt(g,16))
  }
  return out
}
function parsedIp(ip){
  const normalized=normalizeIp(ip),family=net.isIP(normalized);
  if(family===4){const value=ipv4Value(normalized);return value===null?null:{family:4,bits:32,value}}
  if(family===6){const value=ipv6Value(normalized);return value===null?null:{family:6,bits:128,value}}
  return null
}
function parsedCidr(cidr){
  const [rawIp,rawPrefix]=String(cidr||'').split('/');
  const ip=parsedIp(rawIp);
  if(!ip)return null;
  const prefix=rawPrefix===undefined?ip.bits:Number(rawPrefix);
  if(!Number.isInteger(prefix)||prefix<0||prefix>ip.bits)return null;
  return {...ip,prefix}
}
function ipInCidr(ip,cidr){
  const a=parsedIp(ip),c=parsedCidr(cidr);
  if(!a||!c||a.family!==c.family)return false;
  if(c.prefix===0)return true;
  const shift=BigInt(a.bits-c.prefix);
  return (a.value>>shift)===(c.value>>shift)
}
function clientIp(req){
  const headers=req?.headers||{};
  const raw=headers['x-forwarded-for'];
  const value=Array.isArray(raw)?raw[0]:raw;
  return normalizeIp(String(value||'').split(',')[0])
}
function requestFromInternalNetwork(req){
  if(!internalNetworkConfigured())return false;
  const ip=clientIp(req);
  if(!ip)return false;
  return configuredCidrs().some(cidr=>ipInCidr(ip,cidr))
}
function cidrConfigFingerprint(){
  if(!internalNetworkConfigured())return null;
  return crypto.createHash('sha256').update(configuredCidrs().sort().join(',')).digest('hex').slice(0,16)
}
module.exports={configuredCidrs,internalNetworkConfigured,clientIp,requestFromInternalNetwork,ipInCidr,cidrConfigFingerprint};
