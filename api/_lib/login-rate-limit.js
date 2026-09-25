const crypto=require('crypto');
const {query}=require('./db');

const SOURCE_WINDOW_SECONDS=600;
const SOURCE_THRESHOLD=30;
const SOURCE_LOGIN_THRESHOLD=10;
const BLOCK_SECONDS=900;

function secret(){
  const s=String(process.env.TSUBAME_RATE_LIMIT_SECRET||process.env.TSUBAME_SESSION_SECRET||'');
  if(s.length<32){const e=new Error('rate limit secret is not configured');e.code='RATE_LIMIT_NOT_CONFIGURED';throw e}
  return s
}
function hmac(value){
  return crypto.createHmac('sha256',secret()).update(String(value)).digest('hex')
}
function normalizeSource(req){
  const raw=String(req?.headers?.['x-forwarded-for']||req?.headers?.['x-real-ip']||'unknown').split(',')[0].trim().toLowerCase();
  return raw.slice(0,128)||'unknown'
}
function keysForLogin(req,loginId){
  const source=hmac('source:'+normalizeSource(req));
  const login=hmac('login:'+String(loginId||'').trim().toLowerCase());
  return {
    sourceKey:hmac('bucket:source:'+source),
    sourceLoginKey:hmac('bucket:source-login:'+source+':'+login)
  }
}
async function state(keyHash,client=null){
  const r=await query(`
    select key_hash,window_started_at,failure_count,blocked_until,
           (blocked_until is not null and blocked_until>now()) as blocked
      from login_rate_limits
     where key_hash=$1
     limit 1
  `,[keyHash],client);
  return r.rows[0]||null
}
async function assertLoginAllowed(keys,client=null){
  for(const key of [keys.sourceKey,keys.sourceLoginKey]){
    const s=await state(key,client);
    if(s?.blocked){
      const e=new Error('distributed login rate limit exceeded');
      e.code='LOGIN_RATE_LIMITED';
      e.blocked_until=s.blocked_until;
      throw e
    }
  }
}
async function bump(keyHash,threshold,client=null){
  const r=await query(`
    insert into login_rate_limits(key_hash,window_started_at,failure_count,blocked_until,updated_at)
    values($1,now(),1,null,now())
    on conflict (key_hash) do update set
      window_started_at=case
        when login_rate_limits.window_started_at<=now()-($2::text||' seconds')::interval then now()
        else login_rate_limits.window_started_at
      end,
      failure_count=case
        when login_rate_limits.window_started_at<=now()-($2::text||' seconds')::interval then 1
        else login_rate_limits.failure_count+1
      end,
      blocked_until=case
        when login_rate_limits.blocked_until is not null and login_rate_limits.blocked_until>now()
          then login_rate_limits.blocked_until
        when (
          case
            when login_rate_limits.window_started_at<=now()-($2::text||' seconds')::interval then 1
            else login_rate_limits.failure_count+1
          end
        ) >= $3
          then now()+($4::text||' seconds')::interval
        else null
      end,
      updated_at=now()
    returning failure_count,blocked_until,(blocked_until is not null and blocked_until>now()) as blocked
  `,[keyHash,String(SOURCE_WINDOW_SECONDS),threshold,String(BLOCK_SECONDS)],client);
  return r.rows[0]
}
async function recordLoginFailure(keys,client=null){
  const source=await bump(keys.sourceKey,SOURCE_THRESHOLD,client);
  const sourceLogin=await bump(keys.sourceLoginKey,SOURCE_LOGIN_THRESHOLD,client);
  return {source,sourceLogin}
}
module.exports={
  SOURCE_WINDOW_SECONDS,SOURCE_THRESHOLD,SOURCE_LOGIN_THRESHOLD,BLOCK_SECONDS,
  normalizeSource,keysForLogin,assertLoginAllowed,recordLoginFailure,state
};
