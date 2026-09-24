const crypto=require('crypto');
const {query}=require('./db');

async function loadSessionByTokenHash(tokenHash){
  const session=await query(`
    select s.id,s.user_id,s.mfa_verified,s.issued_at,s.expires_at,s.revoked_at,
           u.employee_id,u.display_name,u.role_level,u.safety_authority,u.state,u.mfa_required,
           e.lifecycle_status as employee_lifecycle_status,e.employee_no
      from auth_sessions s
      join users u on u.id=s.user_id
      join employees e on e.id=u.employee_id
     where s.token_hash=$1
     limit 1
  `,[tokenHash]);
  if(!session.rows[0])return null;
  const row=session.rows[0];
  const scopes=await query('select office,department from user_scopes where user_id=$1 order by office,department',[row.user_id]);
  return {...row,scopes:scopes.rows}
}
async function findCredentialAccount(loginId){
  const r=await query(`
    select u.id,u.employee_id,u.login_id,u.password_hash,u.failed_login_count,u.locked_until,
           u.display_name,u.role_level,u.safety_authority,u.state,u.mfa_required,u.version as user_version,
           e.employee_no,e.lifecycle_status as employee_lifecycle_status
      from users u join employees e on e.id=u.employee_id
     where u.login_id=$1 limit 1
  `,[loginId]);
  return r.rows[0]||null
}
async function findCredentialAccountById(userId,client=null){
  const r=await query(`
    select u.id,u.employee_id,u.login_id,u.password_hash,u.failed_login_count,u.locked_until,
           u.display_name,u.role_level,u.safety_authority,u.state,u.mfa_required,u.version as user_version,
           e.employee_no,e.lifecycle_status as employee_lifecycle_status
      from users u join employees e on e.id=u.employee_id
     where u.id=$1 limit 1
  `,[userId],client);
  return r.rows[0]||null
}
async function recordLoginFailure(userId,client=null){
  return query(`
    update users set failed_login_count=failed_login_count+1,
      locked_until=case when failed_login_count+1>=5 then now()+interval '15 minutes' else locked_until end,
      updated_at=now() where id=$1
    returning failed_login_count,locked_until
  `,[userId],client)
}
async function clearLoginFailures(userId,client=null){
  return query(`update users set failed_login_count=0,locked_until=null,last_login_at=now(),updated_at=now() where id=$1`,[userId],client)
}
async function createSession({userId,mfaVerified=false,tokenHash,ttlSeconds=28800,userAgentHash=null,ipPrefixHash=null},client=null){
  const r=await query(`
    insert into auth_sessions(user_id,token_hash,mfa_verified,expires_at,user_agent_hash,ip_prefix_hash)
    values($1,$2,$3,now()+($4::text||' seconds')::interval,$5,$6)
    returning id,user_id,mfa_verified,issued_at,expires_at
  `,[userId,tokenHash,Boolean(mfaVerified),String(ttlSeconds),userAgentHash,ipPrefixHash],client);
  return r.rows[0]
}
async function createMfaChallenge({userId,challengeHash,ttlSeconds=300},client=null){
  const r=await query(`
    insert into mfa_challenges(user_id,challenge_hash,expires_at)
    values($1,$2,now()+($3::text||' seconds')::interval)
    returning id,user_id,created_at,expires_at
  `,[userId,challengeHash,String(ttlSeconds)],client);
  return r.rows[0]
}
async function findMfaMaterial(userId,client=null){
  const r=await query(`select id,mfa_required,mfa_secret_ciphertext,mfa_secret_iv,mfa_secret_tag,mfa_enrolled_at from users where id=$1 limit 1`,[userId],client);
  return r.rows[0]||null
}
async function getMfaChallenge(challengeHash,client=null){
  const r=await query(`select * from mfa_challenges where challenge_hash=$1 and verified_at is null and expires_at>now() limit 1`,[challengeHash],client);
  return r.rows[0]||null
}
async function markMfaVerified(challengeId,client=null){
  return query(`update mfa_challenges set verified_at=now() where id=$1 and verified_at is null`,[challengeId],client)
}
async function recordMfaFailure(challengeId,client=null){
  return query(`update mfa_challenges set failed_attempts=failed_attempts+1 where id=$1`,[challengeId],client)
}
async function revokeSession(sessionId,reason='logout',client=null){
  return query(`update auth_sessions set revoked_at=coalesce(revoked_at,now()),revoke_reason=coalesce(revoke_reason,$2) where id=$1`,[sessionId,reason],client)
}
async function revokeAllUserSessions(userId,reason,client=null){
  return query(`update auth_sessions set revoked_at=now(),revoke_reason=$2 where user_id=$1 and revoked_at is null`,[userId,reason],client)
}
async function writeAuthAudit({actorUserId=null,action,userId=null,result='success',requestId=null,summary=''},client=null){
  const entityId=userId||actorUserId||'authentication';
  return query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,result,request_id,summary) values($1,$2,'auth',$3,$4,$5,$6)`,
    [actorUserId,action,String(entityId),result,requestId,summary],client)
}
function hashMetadata(value){return value?crypto.createHash('sha256').update(String(value)).digest('hex'):null}
module.exports={loadSessionByTokenHash,findCredentialAccount,findCredentialAccountById,findMfaMaterial,recordLoginFailure,clearLoginFailures,createSession,createMfaChallenge,getMfaChallenge,markMfaVerified,recordMfaFailure,revokeSession,revokeAllUserSessions,writeAuthAudit,hashMetadata};
