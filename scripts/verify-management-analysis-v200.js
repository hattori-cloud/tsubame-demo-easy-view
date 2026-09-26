'use strict';

process.env.DATABASE_URL=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
process.env.TSUBAME_DB_SSL='disable';

const {managementSummary}=require('../api/_lib/management-analysis-store');
const {closePool}=require('../api/_lib/db');

function assert(v,m){if(!v)throw new Error(m)}
(async()=>{
  if(!process.env.DATABASE_URL)throw new Error('TEST_DATABASE_URL is required');
  const user={
    id:'00000000-0000-0000-0000-000000000001',
    role_level:'full',state:'active',scopes:[],permissions:[]
  };
  try{
    const a=await managementSummary(user,{mfa:true},{});
    assert(a&&a.safety&&a.access,'management analysis response missing');
    assert(a.access.employees===true&&a.access.deadlines===true,'full admin access flags missing');
    assert(Array.isArray(a.departments),'department rows missing');
    assert(a.workforce&&Number.isFinite(Number(a.workforce.total)),'workforce aggregate missing');
    assert(a.deadlines&&Number.isFinite(Number(a.deadlines.employees_due_60)),'deadline aggregate missing');
    assert(a.credentials&&Number.isFinite(Number(a.credentials.documents_attention)),'credential aggregate missing');
    assert(a.support&&Number.isFinite(Number(a.support.assets_overdue)),'support aggregate missing');
    assert(a.vehicles&&Number.isFinite(Number(a.vehicles.inspection_overdue)),'vehicle aggregate missing');
    assert(a.work&&Object.prototype.hasOwnProperty.call(a.work,'overtime_60_count'),'work aggregate missing');
    assert(a.signals&&Number.isFinite(Number(a.signals.new_hire_with_safety)),'cross signal missing');

    const limitedUser={
      id:'00000000-0000-0000-0000-000000000002',
      role_level:'scoped',state:'active',
      scopes:[{office:'本社',department:'総務課'}],
      permissions:[{feature:'safety_analysis',access_level:'view'}]
    };
    const limited=await managementSummary(limitedUser,{mfa:true},{});
    assert(limited.access.employees===false,'limited analysis leaked employee feature access');
    assert(limited.access.deadlines===false,'limited analysis leaked deadline feature access');
    assert(limited.access.credentials===false,'limited analysis leaked credential feature access');
    assert(limited.access.assets_training===false,'limited analysis leaked asset/training feature access');
    assert(limited.access.vehicles===false,'limited analysis leaked vehicle feature access');
    assert(limited.access.work_import===false,'limited analysis leaked work feature access');
    assert(limited.workforce===null&&limited.deadlines===null&&limited.credentials===null&&limited.support===null&&limited.vehicles===null&&limited.work===null,'limited analysis returned forbidden aggregates');
    assert(Array.isArray(limited.departments)&&limited.departments.length===0,'limited analysis returned forbidden department aggregates');
    assert(limited.signals===null,'limited analysis returned forbidden cross-domain signals');

    console.log(JSON.stringify({ok:true,sql_executed:true,feature_isolation_verified:true,individual_ranking:false,real_employee_data_used:false}))
  }finally{await closePool()}
})().catch(err=>{console.error(err.stack||err);process.exit(1)});
