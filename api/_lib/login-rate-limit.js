const crypto=require('crypto');
const {query}=require('./db');

function intEnv(name,fallback,min,max){
  const n=Number.parseInt(process.env[name]||'',10);
  const v=Number.isFinite(n)?n:fallback;
  return Math.min(max,Math.max(min,v))
}
function config(){
  return {
    sourceLimit:intEnv('TSUBAME_LOGIN_RATE_SOURCE_LIMIT',30,5,500),
    sourceLoginLimit:intEnv('TSUBAME_LOGIN_RATE_SOURCE_LOGIN_LIMIT',10,3,100),
    windowSeconds:intEnv('TSUBAME_LOGIN_RATE_WINDOW_SECONDS',600,60,3600),
    blockSeconds:intEnv('TSUBAME_LOGIN_RATE_BLOCK_SECONDS',900,60,86400)
  }
}
function limiterSecret(){
  const secret=String(process.env.TSUBAME_SESSION_SECRET||'');
  if(secret.length<32){
    const e=new Error('login rate limiter secret is not configured');
    e.code='LOGIN_RATE_LIMIT_NOT_CONFIGURED';
    e.status=503;
    throw e
  }
  return secret
}
function hmac(value){
  return crypto.createHmac('sha256',limiterSecret()).update(String(value)).digest('hex')
}
function sourceText(req){
  const headers=req?.headers||{};
  const raw=headers['x-vercel-forwarded-for']||headers['x-forwarded-for']||headers['x-real-ip']||'unknown';
  return String(Array.isArray(raw)?raw[0]:raw).split(',')[0].trim().slice(0,128)||'unknown'
}
function loginRateKeys(req,loginId){
  const source=sourceText(req);
  const normalizedLogin=String(loginId||'').trim().toLowerCase().slice(0,128);
  return {
    sourceKey:hmac('source:'+source),
    sourceLoginKey:hmac('source_login:'+source+'|'+normalizedLogin)
  }
}
async function checkLoginRateLimit({sourceKey,sourceLoginKey},client=null){
  const keys=[sourceKey,sourceLoginKey].filter(Boolean);
  if(!keys.length)return {blocked:false,retry_after_seconds:0,kinds:[]};
  const r=await query(`
    select kind,
           greatest(0,ceil(extract(epoch from (blocked_until-now()))))::int as retry_after_seconds
      from login_rate_limits
     where key_hash=any($1::text[])
       and blocked_until is not null
       and blocked_until>now()
  `,[keys],client);
  const retry=r.rows.reduce((m,x)=>Math.max(m,Number(x.retry_after_seconds)||0),0);
  return {blocked:r.rows.length>0,retry_after_seconds:retry,kinds:r.rows.map(x=>x.kind)}
}
async function recordOne({keyHash,kind,limit,windowSeconds,blockSeconds},client=null){
  return query(`
    insert into login_rate_limits(
      key_hash,kind,window_started_at,failure_count,blocked_until,updated_at
    ) values(
      $1,$2,now(),1,
      case when 1 >= $3 then now()+($5::text||' seconds')::interval else null end,
      now()
    )
    on conflict(key_hash) do update set
      kind=excluded.kind,
      window_started_at=case
        when login_rate_limits.window_started_at<=now()-($4::text||' seconds')::interval then now()
        else login_rate_limits.window_started_at
      end,
      failure_count=case
        when login_rate_limits.window_started_at<=now()-($4::text||' seconds')::interval then 1
        else login_rate_limits.failure_count+1
      end,
      blocked_until=case
        when login_rate_limits.blocked_until>now() then login_rate_limits.blocked_until
        when login_rate_limits.window_started_at<=now()-($4::text||' seconds')::interval
          then case when 1 >= $3 then now()+($5::text||' seconds')::interval else null end
        when login_rate_limits.failure_count+1 >= $3
          then now()+($5::text||' seconds')::interval
        else null
      end,
      updated_at=now()
    returning kind,failure_count,blocked_until,window_started_at,updated_at
  `,[keyHash,kind,limit,windowSeconds,blockSeconds],client)
}
async function recordLoginRateFailure({sourceKey,sourceLoginKey},client=null){
  const cfg=config();
  const rows=[];
  if(sourceKey){
    const r=await recordOne({keyHash:sourceKey,kind:'source',limit:cfg.sourceLimit,windowSeconds:cfg.windowSeconds,blockSeconds:cfg.blockSeconds},client);
    rows.push(r.rows[0])
  }
  if(sourceLoginKey){
    const r=await recordOne({keyHash:sourceLoginKey,kind:'source_login',limit:cfg.sourceLoginLimit,windowSeconds:cfg.windowSeconds,blockSeconds:cfg.blockSeconds},client);
    rows.push(r.rows[0])
  }
  return rows
}
async function pruneLoginRateLimits(client=null){
  return query(`
    delete from login_rate_limits
     where updated_at<now()-interval '30 days'
       and (blocked_until is null or blocked_until<now()-interval '30 days')
  `,[],client)
}
module.exports={config,sourceText,loginRateKeys,checkLoginRateLimit,recordLoginRateFailure,pruneLoginRateLimits};
