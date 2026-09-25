'use strict';

process.env.DATABASE_URL=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
process.env.TSUBAME_DB_SSL='disable';
process.env.TSUBAME_SESSION_SECRET=process.env.TSUBAME_SESSION_SECRET||'fictional-ci-rate-limit-secret-0123456789abcdef';
process.env.TSUBAME_LOGIN_RATE_SOURCE_LIMIT='5';
process.env.TSUBAME_LOGIN_RATE_SOURCE_LOGIN_LIMIT='3';
process.env.TSUBAME_LOGIN_RATE_WINDOW_SECONDS='600';
process.env.TSUBAME_LOGIN_RATE_BLOCK_SECONDS='120';

const {query,closePool}=require('../api/_lib/db');
const {loginRateKeys,checkLoginRateLimit,recordLoginRateFailure}=require('../api/_lib/login-rate-limit');

function assert(condition,message){if(!condition)throw new Error(message)}

(async()=>{
  await query('truncate table login_rate_limits');
  const req={headers:{'x-forwarded-for':'203.0.113.42'}};
  const a=loginRateKeys(req,'fictional-a');
  const b=loginRateKeys(req,'fictional-b');

  assert(a.sourceKey===b.sourceKey,'same source did not produce the same distributed source key');
  assert(a.sourceLoginKey!==b.sourceLoginKey,'different login ids produced the same source+login key');
  assert((await checkLoginRateLimit(a)).blocked===false,'fresh limiter key is unexpectedly blocked');

  await Promise.all([
    recordLoginRateFailure(a),
    recordLoginRateFailure(a),
    recordLoginRateFailure(a)
  ]);

  const sourceLoginBlocked=await checkLoginRateLimit(a);
  assert(sourceLoginBlocked.blocked,'source+login threshold did not block');
  assert(sourceLoginBlocked.kinds.includes('source_login'),'source+login block kind missing');

  const rowA=(await query('select kind,failure_count,blocked_until from login_rate_limits where key_hash=$1',[a.sourceLoginKey])).rows[0];
  assert(Number(rowA.failure_count)===3,'source+login count expected 3, got '+JSON.stringify(rowA));
  assert(rowA.blocked_until,'source+login blocked_until missing');

  await Promise.all([
    recordLoginRateFailure(b),
    recordLoginRateFailure(b)
  ]);

  const sourceBlocked=await checkLoginRateLimit(b);
  assert(sourceBlocked.blocked,'source threshold did not block across multiple login ids');
  assert(sourceBlocked.kinds.includes('source'),'source block kind missing');

  const sourceRow=(await query('select failure_count,blocked_until from login_rate_limits where key_hash=$1',[a.sourceKey])).rows[0];
  assert(Number(sourceRow.failure_count)===5,'source count expected 5, got '+JSON.stringify(sourceRow));
  assert(sourceRow.blocked_until,'source blocked_until missing');

  const shape=await query(`
    select count(*)::int n,
           bool_and(key_hash ~ '^[0-9a-f]{64}$') as hashes_only,
           bool_and(kind in ('source','source_login')) as kinds_valid
      from login_rate_limits
  `);
  assert(shape.rows[0].n===3,'expected three limiter keys, got '+shape.rows[0].n);
  assert(shape.rows[0].hashes_only&&shape.rows[0].kinds_valid,'limiter persistence shape invalid');

  console.log(JSON.stringify({
    ok:true,
    source_login_parallel_atomic:true,
    source_cross_login_aggregate:true,
    source_login_blocked:true,
    source_blocked:true,
    raw_source_persisted:false,
    rows:shape.rows[0].n,
    real_employee_data_used:false
  }))
})().catch(err=>{
  console.error(err.stack||err);
  process.exitCode=1
}).finally(async()=>{await closePool()});
