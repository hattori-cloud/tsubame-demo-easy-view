const {AuthError}=require('./auth');
const {fixturesEnabled,findUserBySubject,findUserById,findEmployeeById,listEmployees}=require('../_fixtures/staging-registry');

function resolveCurrentUser(identity){
  let user=identity?.user||null;
  if(!user&&fixturesEnabled()){
    user=(identity?.user_id?findUserById(identity.user_id):null)||findUserBySubject(identity?.subject||'')
  }
  if(!user)throw new AuthError(403,'USER_NOT_REGISTERED','このアカウントは利用者台帳に登録されていません');
  if(user.state!=='active')throw new AuthError(403,'USER_SUSPENDED','このアカウントは停止されています');
  if(user.employee_lifecycle_status==='retired')throw new AuthError(403,'EMPLOYEE_RETIRED','退職済みアカウントは利用できません');
  if(user.mfa_required&&!identity?.mfa)throw new AuthError(403,'MFA_REQUIRED','管理者アカウントはMFA確認が必要です');
  return user
}
function canAccessEmployee(user,employee){
  if(!user||!employee)return false;
  if(user.role_level==='full')return true;
  if(user.role_level==='self')return Boolean(user.employee_id&&user.employee_id===employee.id);
  if(user.role_level==='scoped')return (user.scopes||[]).some(s=>s.office===employee.office&&s.department===employee.department);
  return false
}
function requireEmployeeAccess(user,employee){
  if(!employee||!canAccessEmployee(user,employee))throw new AuthError(404,'NOT_FOUND','対象データが見つかりません');
  return employee
}
function getStagingEmployeeForUser(user,id){
  if(!fixturesEnabled())throw new AuthError(503,'DATA_STORE_NOT_CONFIGURED','社員データ接続が未設定です');
  return requireEmployeeAccess(user,findEmployeeById(id))
}
function listStagingEmployeesForUser(user,query={}){
  if(!fixturesEnabled())throw new AuthError(503,'DATA_STORE_NOT_CONFIGURED','社員データ接続が未設定です');
  let rows=listEmployees().filter(employee=>canAccessEmployee(user,employee));
  const q=String(query.q||'').trim().toLowerCase(),office=String(query.office||'').trim(),department=String(query.department||'').trim(),status=String(query.status||'').trim();
  if(office)rows=rows.filter(x=>x.office===office);
  if(department)rows=rows.filter(x=>x.department===department);
  if(status)rows=rows.filter(x=>x.lifecycle_status===status);
  if(q)rows=rows.filter(x=>[x.employee_no,x.name,x.office,x.department,x.position].join(' ').toLowerCase().includes(q));
  const page=Math.max(1,Number.parseInt(query.page,10)||1),pageSize=Math.min(100,Math.max(1,Number.parseInt(query.page_size,10)||50));
  const total=rows.length,start=(page-1)*pageSize;
  return {items:rows.slice(start,start+pageSize),page,page_size:pageSize,total}
}
module.exports={resolveCurrentUser,canAccessEmployee,requireEmployeeAccess,getStagingEmployeeForUser,listStagingEmployeesForUser};
