'use strict';

process.env.DATABASE_URL=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL||'';
process.env.TSUBAME_DB_SSL='disable';

const {query,closePool}=require('../api/_lib/db');
const {updateEmployee}=require('../api/_lib/employee-store');

function assert(condition,message){if(!condition)throw new Error(message)}

(async()=>{
  if(!process.env.DATABASE_URL)throw new Error('TEST_DATABASE_URL is required');

  const actorEmp=(await query("select id from employees where employee_no='CI9001'")).rows[0];
  const target=(await query("select id,version from employees where employee_no='CI9002'")).rows[0];
  assert(actorEmp&&target,'fictional CI employees are required');

  const actor=(await query(`
    insert into users(employee_id,login_id,password_hash,display_name,role_level,safety_authority,state,mfa_required)
    values($1,'ci-concurrency-admin','ci-not-a-real-password-hash','CI架空管理者','full',true,'active',true)
    on conflict (employee_id) do update set display_name=excluded.display_name
    returning id
  `,[actorEmp.id])).rows[0];

  const user={id:actor.id,employee_id:actorEmp.id,role_level:'full',safety_authority:true,state:'active',scopes:[]};
  const expectedVersion=Number(target.version);

  const attempts=[
    updateEmployee({user,employeeId:target.id,body:{position:'CI競合更新A'},expectedVersion,requestId:'ci-concurrency-a'}),
    updateEmployee({user,employeeId:target.id,body:{position:'CI競合更新B'},expectedVersion,requestId:'ci-concurrency-b'})
  ];
  const settled=await Promise.allSettled(attempts);
  const fulfilled=settled.filter(x=>x.status==='fulfilled');
  const rejected=settled.filter(x=>x.status==='rejected');

  assert(fulfilled.length===1,'exactly one concurrent update must succeed: '+JSON.stringify(settled.map(x=>x.status)));
  assert(rejected.length===1,'exactly one concurrent update must be rejected');
  assert(rejected[0].reason&&rejected[0].reason.code==='VERSION_CONFLICT','losing update must return VERSION_CONFLICT');

  const after=(await query('select version,position from employees where id=$1',[target.id])).rows[0];
  assert(Number(after.version)===expectedVersion+1,'employee version must increment exactly once');
  assert(['CI競合更新A','CI競合更新B'].includes(after.position),'unexpected winning position');

  const histories=await query("select count(*)::int as n from record_histories where entity_type='employee' and entity_id=$1::text and action='profile_update'",[target.id]);
  assert(histories.rows[0].n===1,'concurrent update must create exactly one profile history');

  console.log(JSON.stringify({
    ok:true,
    one_update_succeeded:true,
    one_update_rejected_with:'VERSION_CONFLICT',
    version_increment:1,
    history_rows:histories.rows[0].n,
    real_employee_data_used:false
  }));
})().catch(err=>{
  console.error(err.stack||err);
  process.exitCode=1;
}).finally(async()=>{
  try{await closePool()}catch(_){}
});
