const {AuthError}=require('./auth');
const {fixturesEnabled,findUserBySubject,findEmployeeById}=require('../_fixtures/staging-registry');

function resolveCurrentUser(identity){
  if(!fixturesEnabled())throw new AuthError(503,'USER_STORE_NOT_CONFIGURED','ユーザー台帳の接続が未設定です');
  const user=findUserBySubject(identity.subject);
  if(!user)throw new AuthError(403,'USER_NOT_REGISTERED','このアカウントは利用者台帳に登録されていません');
  if(user.state!=='active')throw new AuthError(403,'USER_SUSPENDED','このアカウントは停止されています');
  if(user.mfa_required&&!identity.mfa)throw new AuthError(403,'MFA_REQUIRED','管理者アカウントはMFA確認が必要です');
  return user
}
function canAccessEmployee(user,employee){
  if(!user||!employee)return false;
  if(user.role_level==='full')return true;
  if(user.role_level==='self')return Boolean(user.employee_id&&user.employee_id===employee.id);
  if(user.role_level==='scoped'){
    return (user.scopes||[]).some(s=>s.office===employee.office&&s.department===employee.department)
  }
  return false
}
function requireEmployeeAccess(user,employee){
  if(!employee)throw new AuthError(404,'NOT_FOUND','対象データが見つかりません');
  if(!canAccessEmployee(user,employee))throw new AuthError(404,'NOT_FOUND','対象データが見つかりません');
  return employee
}
function getStagingEmployeeForUser(user,id){
  if(!fixturesEnabled())throw new AuthError(503,'DATA_STORE_NOT_CONFIGURED','社員データ接続が未設定です');
  return requireEmployeeAccess(user,findEmployeeById(id))
}
module.exports={resolveCurrentUser,canAccessEmployee,requireEmployeeAccess,getStagingEmployeeForUser};
