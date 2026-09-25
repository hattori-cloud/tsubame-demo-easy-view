'use strict';

const fs=require('node:fs');
const path=require('node:path');
const {Client}=require('pg');

function assert(condition,message){if(!condition)throw new Error(message)}
async function expectDenied(work,label){
  try{
    await work();
    throw new Error(label+' unexpectedly succeeded')
  }catch(err){
    if(!['42501','55000'].includes(String(err.code)))throw err
  }
}

(async()=>{
  const connectionString=process.env.TEST_DATABASE_URL;
  if(!connectionString)throw new Error('TEST_DATABASE_URL is required');

  const admin=new Client({connectionString,ssl:false});
  await admin.connect();
  const password='ci-runtime-role-password';
  try{
    await admin.query("do $$ begin if not exists(select 1 from pg_roles where rolname='tsubame_app') then create role tsubame_app login password 'ci-runtime-role-password' nosuperuser nocreatedb nocreaterole noinherit; end if; end $$;");
    const grants=fs.readFileSync(path.join(__dirname,'..','docs','production-runtime-grants-v200.sql'),'utf8');
    await admin.query(grants);

    const parsed=new URL(connectionString);
    parsed.username='tsubame_app';
    parsed.password=password;
    const app=new Client({connectionString:parsed.toString(),ssl:false});
    await app.connect();
    try{
      const employee=(await admin.query("insert into employees(employee_no,name,office,department,lifecycle_status) values('CIROLE1','架空権限試験','本社','タクシー課','active') returning id")).rows[0];

      await app.query('select id,employee_no from employees where id=$1',[employee.id]);
      await app.query("update employees set safety_state='CI権限試験' where id=$1",[employee.id]);
      await app.query("insert into audit_logs(action,entity_type,entity_id,result,summary) values('ci_role_probe','ci','role-audit','success','fictional CI role probe')");
      await app.query("insert into record_histories(entity_type,entity_id,action,reason) values('ci','role-history','ci_probe','fictional CI role probe')");

      await expectDenied(()=>app.query("update audit_logs set summary='mutated' where entity_id='role-audit'"),'audit update');
      await expectDenied(()=>app.query("delete from record_histories where entity_id='role-history'"),'history delete');
      await expectDenied(()=>app.query('alter table employees add column ci_forbidden text'),'alter table');
      await expectDenied(()=>app.query('create table ci_forbidden_table(id int)'),'create table');
      await expectDenied(()=>app.query('drop table employees'),'drop table');
      await expectDenied(()=>app.query('truncate employees'),'truncate');

      const user=(await admin.query("insert into users(employee_id,login_id,password_hash,display_name,role_level,state,mfa_required) values($1,'ci-role-user','ci-hash','CI架空権限利用者','self','active',false) returning id",[employee.id])).rows[0];

      await app.query("insert into drafts(owner_user_id,kind,payload) values($1,'accident','{}'::jsonb)",[user.id]);
      await app.query("delete from drafts where owner_user_id=$1 and kind='accident'",[user.id]);
      await app.query("insert into user_scopes(user_id,office,department) values($1,'本社','タクシー課')",[user.id]);
      await app.query('delete from user_scopes where user_id=$1',[user.id]);

      const priv=await admin.query("select has_schema_privilege('tsubame_app','public','CREATE') as schema_create, has_table_privilege('tsubame_app','audit_logs','UPDATE') as audit_update, has_table_privilege('tsubame_app','record_histories','DELETE') as history_delete, has_table_privilege('tsubame_app','employees','SELECT') as employee_select, has_table_privilege('tsubame_app','employees','UPDATE') as employee_update, has_table_privilege('tsubame_app','drafts','DELETE') as drafts_delete");
      const p=priv.rows[0];
      assert(p.schema_create===false,'runtime role has CREATE on public schema');
      assert(p.audit_update===false,'runtime role has audit UPDATE');
      assert(p.history_delete===false,'runtime role has history DELETE');
      assert(p.employee_select===true&&p.employee_update===true,'runtime role lacks required employee privileges');
      assert(p.drafts_delete===true,'runtime role lacks required draft DELETE');

      console.log(JSON.stringify({ok:true,runtime_role:'tsubame_app',schema_create:false,audit_update:false,history_delete:false,ddl_denied:true,required_dml:true,real_employee_data_used:false}))
    }finally{
      await app.end()
    }
  }finally{
    await admin.end()
  }
})().catch(err=>{
  console.error(err.stack||err);
  process.exit(1)
});
