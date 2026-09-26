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
  const dbName='tsubame_workflow_migration_ci';
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
    const migration=fs.readFileSync(path.join(__dirname,'..','docs','production-selected-user-workflow-v200.sql'),'utf8');
    await client.query(schema);

    await client.query('alter table user_feature_permissions drop constraint if exists user_feature_permissions_feature_check');
    await client.query(`
      alter table user_feature_permissions
        add constraint user_feature_permissions_feature_check check (feature in (
          'employees','deadlines','accidents','complaints','near_misses','credentials_documents',
          'vehicles','safety_analysis','work_import','assets_training','notices_workflow',
          'audit_logs','user_admin'
        ))
    `);

    const employees=await client.query(`
      insert into employees(employee_no,name,office,department,lifecycle_status)
      values
        ('MIG-CI-1','架空移行利用者1','本社','総務課','active'),
        ('MIG-CI-2','架空移行利用者2','府中','タクシー課','active')
      returning id
    `);
    const users=await client.query(`
      insert into users(employee_id,login_id,password_hash,display_name,role_level,state,mfa_required)
      values
        ($1,'mig-ci-view','ci-hash','架空移行VIEW','scoped','active',true),
        ($2,'mig-ci-edit','ci-hash','架空移行EDIT','scoped','active',true)
      returning id
    `,[employees.rows[0].id,employees.rows[1].id]);

    await client.query(`
      insert into user_feature_permissions(user_id,feature,access_level)
      values($1,'notices_workflow','view'),($2,'notices_workflow','edit')
    `,[users.rows[0].id,users.rows[1].id]);

    await client.query(migration);

    const rows=await client.query(`
      select u.login_id,p.feature,p.access_level
        from user_feature_permissions p join users u on u.id=p.user_id
       order by u.login_id,p.feature
    `);
    const byLogin=Object.fromEntries(rows.rows.map(x=>[x.login_id,x]));
    assert(byLogin['mig-ci-view']?.feature==='handoffs'&&byLogin['mig-ci-view']?.access_level==='view','view permission was not preserved');
    assert(byLogin['mig-ci-edit']?.feature==='handoffs'&&byLogin['mig-ci-edit']?.access_level==='edit','edit permission was not preserved');
    assert(rows.rows.every(x=>x.feature!=='notices_workflow'),'retired notices_workflow permission remains');

    let rejected=false;
    try{
      await client.query("insert into user_feature_permissions(user_id,feature,access_level) values($1,'notices_workflow','view')",[users.rows[0].id])
    }catch(err){rejected=String(err.code)==='23514'}
    assert(rejected,'new feature constraint did not reject notices_workflow');

    await client.query(migration);
    const afterSecond=await client.query("select count(*)::int n from user_feature_permissions where feature='handoffs'");
    assert(afterSecond.rows[0].n===2,'migration is not idempotent');

    console.log(JSON.stringify({
      ok:true,
      legacy_view_to_handoffs_view:true,
      legacy_edit_to_handoffs_edit:true,
      retired_permission_rejected:true,
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
