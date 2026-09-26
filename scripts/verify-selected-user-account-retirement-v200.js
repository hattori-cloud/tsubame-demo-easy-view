'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('pg');

function assert(v,m){if(!v)throw new Error(m)}
function databaseUrl(base,name){
  const u=new URL(base);
  u.pathname='/'+name;
  return u.toString()
}
async function run(){
  const baseUrl=process.env.TEST_DATABASE_URL;
  if(!baseUrl)throw new Error('TEST_DATABASE_URL is required');
  const dbName='tsubame_self_retirement_ci';
  const admin=new Client({connectionString:databaseUrl(baseUrl,'postgres'),ssl:false});
  await admin.connect();
  try{
    await admin.query('drop database if exists '+dbName+' with (force)');
    await admin.query('create database '+dbName)
  }finally{await admin.end()}

  const client=new Client({connectionString:databaseUrl(baseUrl,dbName),ssl:false});
  await client.connect();
  try{
    const schema=fs.readFileSync(path.join(__dirname,'..','docs','production-schema.sql'),'utf8');
    const migration=fs.readFileSync(path.join(__dirname,'..','docs','production-selected-user-account-retirement-v200.sql'),'utf8');
    await client.query(schema);

    const checks=await client.query(`
      select conname,pg_get_constraintdef(oid) def
        from pg_constraint
       where conrelid='users'::regclass and contype='c'
    `);
    for(const row of checks.rows){
      const def=String(row.def||'');
      if(def.includes('role_level') || (def.includes('mfa_required')&&!def.includes('mfa_secret'))){
        await client.query('alter table users drop constraint '+client.escapeIdentifier(row.conname))
      }
    }
    await client.query(`
      alter table users
        add constraint legacy_users_role_level_check check (role_level in ('full','scoped','self')),
        add constraint legacy_users_mfa_required_check check (role_level='self' or mfa_required=true)
    `);

    const employee=(await client.query(`
      insert into employees(employee_no,name,office,department,lifecycle_status)
      values('SELF-MIG-CI','架空旧self利用者','本社','総務課','active')
      returning id
    `)).rows[0];
    const user=(await client.query(`
      insert into users(employee_id,login_id,password_hash,display_name,role_level,state,mfa_required)
      values($1,'legacy-self-ci','ci-hash','架空旧self利用者','self','active',false)
      returning id
    `,[employee.id])).rows[0];

    await client.query("insert into user_scopes(user_id,office,department) values($1,'本社','総務課')",[user.id]);
    await client.query("insert into user_feature_permissions(user_id,feature,access_level) values($1,'employees','view')",[user.id]);
    await client.query(`
      insert into auth_sessions(user_id,token_hash,mfa_verified,expires_at)
      values($1,repeat('a',64),false,now()+interval '1 hour')
    `,[user.id]);

    await client.query(migration);

    const after=(await client.query(`
      select id,role_level,state,mfa_required,version from users where id=$1
    `,[user.id])).rows[0];
    assert(after.id===user.id,'legacy user id changed');
    assert(after.role_level==='scoped','legacy self was not converted to scoped');
    assert(after.state==='suspended','legacy self was not suspended');
    assert(after.mfa_required===true,'MFA was not required after conversion');

    const scopeCount=(await client.query('select count(*)::int n from user_scopes where user_id=$1',[user.id])).rows[0].n;
    const permissionCount=(await client.query('select count(*)::int n from user_feature_permissions where user_id=$1',[user.id])).rows[0].n;
    assert(scopeCount===0,'legacy scopes remain');
    assert(permissionCount===0,'legacy feature permissions remain');

    const session=(await client.query('select revoked_at,revoke_reason from auth_sessions where user_id=$1',[user.id])).rows[0];
    assert(session.revoked_at,'legacy session was not revoked');
    assert(session.revoke_reason==='legacy_self_role_retired','legacy session revoke reason mismatch');

    const auditCount=(await client.query("select count(*)::int n from audit_logs where entity_type='user' and entity_id=$1 and action='旧self利用者停止'",[user.id])).rows[0].n;
    assert(auditCount===1,'legacy self retirement audit missing');

    let roleRejected=false,mfaRejected=false;
    try{await client.query("update users set role_level='self' where id=$1",[user.id])}catch(err){roleRejected=String(err.code)==='23514'}
    try{await client.query("update users set mfa_required=false where id=$1",[user.id])}catch(err){mfaRejected=String(err.code)==='23514'}
    assert(roleRejected,'selected-user role constraint did not reject self');
    assert(mfaRejected,'selected-user MFA constraint did not reject false');

    await client.query(migration);
    const auditAfterSecond=(await client.query("select count(*)::int n from audit_logs where entity_type='user' and entity_id=$1 and action='旧self利用者停止'",[user.id])).rows[0].n;
    assert(auditAfterSecond===1,'migration is not idempotent');

    console.log(JSON.stringify({
      ok:true,
      preserved_user_id:true,
      suspended_scoped:true,
      scopes_cleared:true,
      feature_permissions_cleared:true,
      session_revoked:true,
      retirement_audited:true,
      self_role_rejected:true,
      mfa_required:true,
      idempotent:true,
      real_employee_data_used:false
    }))
  }finally{
    await client.end();
    const cleanup=new Client({connectionString:databaseUrl(baseUrl,'postgres'),ssl:false});
    await cleanup.connect();
    try{await cleanup.query('drop database if exists '+dbName+' with (force)')}finally{await cleanup.end()}
  }
}
run().catch(err=>{console.error(err.stack||err);process.exit(1)});
