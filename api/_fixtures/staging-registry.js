const USERS=[
  {id:'11111111-1111-4111-8111-111111111111',external_subject:'demo-admin-full',display_name:'デモ全社管理者',role_level:'full',safety_authority:true,state:'active',mfa_required:true,employee_id:null,scopes:[]},
  {id:'22222222-2222-4222-8222-222222222222',external_subject:'demo-admin-hq-taxi',display_name:'デモ本社担当管理者',role_level:'scoped',safety_authority:false,state:'active',mfa_required:true,employee_id:null,scopes:[{office:'本社',department:'タクシー1課'}]},
  {id:'33333333-3333-4333-8333-333333333333',external_subject:'demo-admin-fuchu-taxi',display_name:'デモ府中担当管理者',role_level:'scoped',safety_authority:false,state:'active',mfa_required:true,employee_id:null,scopes:[{office:'府中',department:'タクシー2課'}]},
  {id:'44444444-4444-4444-8444-444444444444',external_subject:'demo-self-hq-taxi',display_name:'デモ一般社員',role_level:'self',safety_authority:false,state:'active',mfa_required:false,employee_id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',scopes:[]}
];
const EMPLOYEES=[
  {id:'aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa',employee_no:'DEMO-1001',name:'架空 一郎',office:'本社',department:'タクシー1課',position:'乗務員',lifecycle_status:'active',safety_state:'通常',version:1},
  {id:'bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb',employee_no:'DEMO-2001',name:'架空 二郎',office:'府中',department:'タクシー2課',position:'乗務員',lifecycle_status:'active',safety_state:'通常',version:1},
  {id:'cccccccc-cccc-4ccc-8ccc-cccccccccccc',employee_no:'DEMO-3001',name:'架空 三郎',office:'馬木',department:'バス課',position:'乗務員',lifecycle_status:'active',safety_state:'通常',version:1}
];
function fixturesEnabled(){return process.env.TSUBAME_ENABLE_STAGING_FIXTURES==='1'}
function requireFixtures(){
  if(!fixturesEnabled()){const e=new Error('STAGING_FIXTURES_DISABLED');e.code='STAGING_FIXTURES_DISABLED';throw e}
}
function findUserBySubject(subject){requireFixtures();return USERS.find(x=>x.external_subject===subject)||null}
function findEmployeeById(id){requireFixtures();return EMPLOYEES.find(x=>x.id===id)||null}
function listEmployees(){requireFixtures();return EMPLOYEES.map(x=>({...x}))}
module.exports={fixturesEnabled,findUserBySubject,findEmployeeById,listEmployees};
