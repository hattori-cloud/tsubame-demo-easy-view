const assert=require('node:assert/strict');
const crypto=require('node:crypto');
const {hash,Algorithm}=require('@node-rs/argon2');

process.env.DATABASE_URL=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
process.env.TSUBAME_DB_SSL='disable';
process.env.VERCEL_ENV='preview';
process.env.NODE_ENV='test';
process.env.TSUBAME_ENABLE_STAGING_FIXTURES='0';
process.env.TSUBAME_SESSION_SECRET=process.env.TSUBAME_SESSION_SECRET||'fictional-ci-session-secret-0123456789abcdef';
process.env.TSUBAME_MFA_ENCRYPTION_KEY=process.env.TSUBAME_MFA_ENCRYPTION_KEY||Buffer.alloc(32,7).toString('base64');

const db=require('../api/_lib/db');
const q=(sql,params=[])=>db.query(sql,params);
const auth=require('../api/_lib/auth');
const authStore=require('../api/_lib/auth-store');
const mfa=require('../api/_lib/mfa');
const users=require('../api/_lib/user-store');
const employees=require('../api/_lib/employee-store');
const safety=require('../api/_lib/safety-store');
const vehicles=require('../api/_lib/vehicle-store');
const support=require('../api/_lib/support-store');
const router=require('../api/router');

const requestId='fictional-ci-audit-regression';
const report={ok:false,cases:{}};

async function call(route,method='GET',body={},cookie='',headers={},query={}){
  const res={
    statusCode:200,headers:{},
    setHeader(k,v){this.headers[String(k).toLowerCase()]=v},
    status(n){this.statusCode=n;return this},
    json(v){this.body=v;return this},
    end(v){this.body=v;return this}
  };
  await router({url:'/api/v1'+route,method,body,headers:{cookie,...headers},query},res);
  return res
}
function brief(res){return {status:res.statusCode,code:res.body?.error?.code||res.body?.code}}
async function seed(no,role='self',office='HQ',department='Taxi'){
  const e=(await q(
    'insert into employees(employee_no,name,office,department) values($1,$2,$3,$4) returning *',
    [no,'Fictional '+no,office,department]
  )).rows[0];
  const password='Audit-only-password-987!';
  const passwordHash=await hash(password,{algorithm:Algorithm.Argon2id,memoryCost:19456,timeCost:2,parallelism:1});
  const u=(await q(
    'insert into users(employee_id,login_id,password_hash,display_name,role_level,mfa_required) values($1,$2,$3,$4,$5,$6) returning *',
    [e.id,'audit-'+no,passwordHash,'Fictional '+no,role,role!=='self']
  )).rows[0];
  if(role==='scoped')await q('insert into user_scopes(user_id,office,department) values($1,$2,$3)',[u.id,office,department]);
  u.scopes=role==='scoped'?[{office,department}]:[];
  const raw=auth.newRawToken();
  await authStore.createSession({userId:u.id,tokenHash:auth.tokenHash(raw),mfaVerified:role!=='self',ttlSeconds:3600});
  return {e,u,password,cookie:auth.secureCookie(raw,3600).split(';')[0]}
}
async function login(a){
  return call('/auth/login','POST',{login_id:a.u.login_id,employee_no:a.e.employee_no,password:a.password})
}
async function enrollStart(token){return call('/auth/mfa/enroll/start','POST',{challenge_token:token})}
async function enrollComplete(token,secret){
  return call('/auth/mfa/enroll/complete','POST',{challenge_token:token,code:mfa.totpCode(secret,Math.floor(Date.now()/30000))})
}

(async()=>{
  const admin=await seed('RG-A','full');
  const staff=await seed('RG-S');
  const scoped=await seed('RG-G','scoped');
  const outside=await seed('RG-O','self','REMOTE','Other');

  // H07: employee number change route must work and preserve immutable employee id.
  {
    const res=await call('/employees/'+staff.e.id+'/employee-number','POST',
      {new_employee_no:'RG-S-NEW',reason:'fictional regression'},admin.cookie,{'if-match':'"1"'});
    assert.equal(res.statusCode,200);
    const row=(await q('select id,employee_no from employees where id=$1',[staff.e.id])).rows[0];
    assert.equal(row.id,staff.e.id);
    assert.equal(row.employee_no,'RG-S-NEW');
    report.cases.H07={status:res.statusCode,employee_no:row.employee_no}
  }

  // H02: first-time MFA enrollment is single-use per user, not just per challenge.
  {
    const a=await seed('RG-M','full');
    const ca=(await login(a)).body.challenge_token;
    const cb=(await login(a)).body.challenge_token;
    const sa=await enrollStart(ca),sb=await enrollStart(cb);
    assert.equal(sa.statusCode,200);assert.equal(sb.statusCode,200);
    const first=await enrollComplete(ca,sa.body.secret);
    const replay=await enrollComplete(ca,sa.body.secret);
    const staleOther=await enrollComplete(cb,sb.body.secret);
    assert.equal(first.statusCode,200);
    assert.equal(replay.statusCode,401);
    assert.equal(staleOther.statusCode,401);
    const material=await authStore.findMfaMaterial(a.u.id);
    assert.equal(mfa.decryptSecret(material),sa.body.secret);
    report.cases.H02={first:first.statusCode,replay:replay.statusCode,other_old:staleOther.statusCode}
  }

  // H03: password reset invalidates a pending MFA enrollment flow.
  {
    const a=await seed('RG-R','full');
    const challenge=(await login(a)).body.challenge_token;
    const start=await enrollStart(challenge);
    assert.equal(start.statusCode,200);
    const resetRaw=auth.newRawToken();
    await users.issuePasswordReset({actor:admin.u,userId:a.u.id,tokenHash:auth.tokenHash(resetRaw),requestId});
    await users.completePasswordReset({
      tokenHash:auth.tokenHash(resetRaw),
      passwordHash:await hash('New-audit-password-987!',{algorithm:Algorithm.Argon2id,memoryCost:19456,timeCost:2,parallelism:1}),
      requestId
    });
    const stale=await enrollComplete(challenge,start.body.secret);
    assert.equal(stale.statusCode,401);
    const active=(await q('select count(*)::int n from auth_sessions where user_id=$1 and revoked_at is null',[a.u.id])).rows[0].n;
    assert.equal(active,0);
    report.cases.H03={stale_enrollment:stale.statusCode,active_sessions:active}
  }

  // H04: two same-version accident updates must produce exactly one success and one VERSION_CONFLICT.
  {
    const a=await safety.createAccident({user:admin.u,body:{
      employee_id:staff.e.id,occurred_on:'2026-09-25',address:'Fictional location',summary:'original'
    },requestId});
    const blocker=await db.getPool().connect();
    await blocker.query('begin');
    await blocker.query('select id from accidents where id=$1 for update',[a.id]);
    const jobs=['edit A','edit B'].map(summary=>
      safety.updateAccident({user:admin.u,id:a.id,body:{summary},expectedVersion:a.version,requestId})
        .then(x=>({success:true,version:x.version}),e=>({success:false,code:e.code}))
    );
    await new Promise(r=>setTimeout(r,300));
    await blocker.query('commit');blocker.release();
    const results=await Promise.all(jobs);
    assert.equal(results.filter(x=>x.success).length,1);
    assert.equal(results.filter(x=>x.code==='VERSION_CONFLICT').length,1);
    const after=(await q('select version from accidents where id=$1',[a.id])).rows[0];
    const histories=(await q('select count(*)::int n from record_histories where entity_id=$1',[a.id])).rows[0].n;
    assert.equal(after.version,a.version+1);
    assert.equal(histories,1);
    report.cases.H04={results,version:after.version,histories}
  }

  // H08: ordinary patch cannot complete/reopen; completed complaint cannot be edited until reopen.
  {
    const c=await safety.createComplaint({user:admin.u,body:{
      employee_id:staff.e.id,responded_on:'2026-09-25',summary:'Fictional complaint'
    },requestId});
    await assert.rejects(
      ()=>safety.completeComplaint({user:admin.u,id:c.id,expectedVersion:c.version,requestId}),
      e=>e?.code==='COMPLETION_FIELDS_REQUIRED'
    );
    await assert.rejects(
      ()=>safety.updateComplaint({user:admin.u,id:c.id,body:{status:'completed'},expectedVersion:c.version,requestId}),
      e=>e?.code==='USE_COMPLETION_ENDPOINT'
    );
    const prepared=await safety.updateComplaint({user:admin.u,id:c.id,body:{
      guidance_content:'Fictional guidance',next_action:'Fictional follow-up'
    },expectedVersion:c.version,requestId});
    const completed=await safety.completeComplaint({user:admin.u,id:c.id,expectedVersion:prepared.version,requestId});
    assert.equal(completed.status,'completed');
    assert.ok(completed.completed_at);
    await assert.rejects(
      ()=>safety.updateComplaint({user:admin.u,id:c.id,body:{summary:'edit without reopen'},expectedVersion:completed.version,requestId}),
      e=>e?.code==='REOPEN_REQUIRED'
    );
    report.cases.H08={completed:true,edit_after_complete:'REOPEN_REQUIRED'}
  }

  // H05: manager-only records are not readable by self users.
  {
    await support.createSupport({user:admin.u,kind:'guidance',body:{
      employee_id:staff.e.id,guidance_on:'2026-09-25',type:'Fictional manager review',
      summary:'MANAGER ONLY',owner:'Fictional Admin'
    },requestId});
    const statuses={};
    for(const route of ['/accidents','/complaints','/guidance']){
      const res=await call(route,'GET',{},staff.cookie);
      statuses[route]=brief(res);
      assert.equal(res.statusCode,403)
    }
    report.cases.H05=statuses
  }

  // H06: scoped vehicle list may include the vehicle, but cannot expose out-of-scope employee identity.
  {
    const v=await vehicles.createVehicle({user:admin.u,body:{
      car_no:'998',inspection_due:'2027-09-25',assignment_mode:'shared'
    },requestId});
    await vehicles.updateVehicleAssignments({user:admin.u,id:v.id,body:{
      primary_employee_id:outside.e.id,additional_employee_ids:[staff.e.id],assignment_mode:'shared'
    },expectedVersion:v.version,requestId});
    const self=await call('/vehicles','GET',{},staff.cookie);
    assert.equal(self.statusCode,403);
    const scopedRes=await call('/vehicles','GET',{},scoped.cookie);
    assert.equal(scopedRes.statusCode,200);
    const serialized=JSON.stringify(scopedRes.body);
    assert.equal(serialized.includes(outside.e.name),false);
    assert.equal(serialized.includes(outside.e.employee_no),false);
    assert.equal(serialized.includes(outside.e.id),false);
    report.cases.H06={self:self.statusCode,scoped:scopedRes.statusCode,leak:false}
  }

  // M01: unchanged same-day assignments must not be ended/reinserted or hit a unique violation.
  {
    const v=await vehicles.createVehicle({user:admin.u,body:{
      car_no:'997',inspection_due:'2027-09-25',primary_employee_id:staff.e.id,assignment_mode:'shared'
    },requestId});
    const first=await call('/vehicles/'+v.id+'/assignments','POST',{
      primary_employee_id:staff.e.id,additional_employee_ids:[outside.e.id],assignment_mode:'shared'
    },admin.cookie,{'if-match':'"'+v.version+'"'});
    assert.equal(first.statusCode,200);
    const second=await call('/vehicles/'+v.id+'/assignments','POST',{
      primary_employee_id:staff.e.id,additional_employee_ids:[outside.e.id],assignment_mode:'shared'
    },admin.cookie,{'if-match':'"'+first.body.version+'"'});
    assert.equal(second.statusCode,200);
    const active=(await q('select employee_id,role from vehicle_users where vehicle_id=$1 and ended_on is null order by role,employee_id',[v.id])).rows;
    assert.equal(active.length,2);
    report.cases.M01={first:first.statusCode,second:second.statusCode,active_rows:active.length}
  }

  // H01: force both retirement operations into the old race window. Advisory lock must serialize them.
  {
    await q("update users set state='suspended' where role_level='full'");
    const a=await seed('RG-L1','full');
    const b=await seed('RG-L2','full');
    const blocker=await db.getPool().connect();
    await blocker.query('begin');
    await blocker.query('select id from users where id=any($1::uuid[]) for update',[[a.u.id,b.u.id]]);
    const jobs=[a,b].map(x=>
      employees.transitionEmployee({
        employeeId:x.e.id,target:{lifecycle_status:'retired'},reason:'fictional concurrent retirement',
        actorUserId:a.u.id,expectedVersion:1,requestId
      }).then(y=>({success:true,status:y.lifecycle_status}),e=>({success:false,code:e.code}))
    );
    await new Promise(r=>setTimeout(r,400));
    await blocker.query('commit');blocker.release();
    const results=await Promise.all(jobs);
    const left=(await q(
      "select count(*)::int n from users u join employees e on e.id=u.employee_id where u.role_level='full' and u.state='active' and e.lifecycle_status<>'retired'"
    )).rows[0].n;
    assert.equal(results.filter(x=>x.success).length,1);
    assert.equal(results.filter(x=>x.code==='LAST_FULL_ADMIN_REQUIRED').length,1);
    assert.equal(left,1);
    report.cases.H01={results,active_full_admins:left}
  }

  report.ok=true;
  report.real_employee_data_used=false;
  console.log(JSON.stringify(report))
})().catch(err=>{
  report.error={name:err.name,code:err.code,message:err.message,stack:err.stack};
  console.error(JSON.stringify(report));
  process.exitCode=1
}).finally(async()=>{await db.closePool()});
