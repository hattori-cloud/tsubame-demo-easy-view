'use strict';

process.env.TSUBAME_DB_SSL=process.env.TSUBAME_DB_SSL||'disable';
const {withTransaction,closePool}=require('../api/_lib/db');

(async()=>{
  const result=await withTransaction(async client=>{
    const expiredSessions=await client.query(`
      delete from auth_sessions
       where expires_at<now()-interval '30 days'
          or (revoked_at is not null and revoked_at<now()-interval '30 days')
    `);
    const expiredChallenges=await client.query(`
      delete from mfa_challenges
       where expires_at<now()-interval '7 days'
         and (verified_at is not null or failed_attempts>=5 or expires_at<now()-interval '30 days')
    `);
    const resetTokens=await client.query(`
      delete from password_reset_tokens
       where expires_at<now()-interval '30 days'
          or (used_at is not null and used_at<now()-interval '30 days')
    `);
    const rateLimits=await client.query(`
      delete from login_rate_limits
       where updated_at<now()-interval '30 days'
         and (blocked_until is null or blocked_until<now()-interval '30 days')
    `);
    const expiredImportRows=await client.query(`
      delete from work_import_rows r
       using work_import_batches b
       where r.batch_id=b.id
         and b.state='preflight'
         and b.expires_at<now()-interval '30 days'
    `);
    const expiredImportBatches=await client.query(`
      delete from work_import_batches
       where state='preflight'
         and expires_at<now()-interval '30 days'
    `);
    await client.query(`
      update work_import_batches
         set state='expired',updated_at=now(),version=version+1
       where state='preflight' and expires_at<=now()
    `);
    return {
      expired_sessions_deleted:expiredSessions.rowCount,
      expired_mfa_challenges_deleted:expiredChallenges.rowCount,
      password_reset_tokens_deleted:resetTokens.rowCount,
      login_rate_limit_rows_deleted:rateLimits.rowCount,
      expired_work_import_rows_deleted:expiredImportRows.rowCount,
      expired_work_import_batches_deleted:expiredImportBatches.rowCount
    }
  });
  console.log(JSON.stringify({ok:true,...result,real_employee_data_echoed:false}))
})().catch(err=>{
  console.error(JSON.stringify({ok:false,error:'MAINTENANCE_FAILED',message:err.message}));
  process.exitCode=1
}).finally(async()=>{await closePool()});
