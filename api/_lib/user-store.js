const {query,withTransaction}=require('./db');
const {lockFullAdminContinuity,requireOtherActiveFullAdmin}=require('./admin-continuity');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function assertFullAdmin(user){if(!user||user.role_level!=='full')throw problem(403,'FULL_ADMIN_REQUIRED','利用者管理は全社管理者のみ実行できます')}
function assertVersion(row,expected){if(Number(row.version)!==Number(expected))throw problem(409,'VERSION_CONFLICT','別の利用者が先に更新しています。最新データを読み直してください')}
const FEATURE_CODES=new Set([
  'employees','deadlines','accidents','complaints','near_misses','credentials_documents',
  'vehicles','safety_analysis','work_import','assets_training','notices_workflow','audit_logs','user_admin'
]);
function normalizePermissions(permissions){
  if(!Array.isArray(permissions))return [];
  const byFeature=new Map();
  for(const p of permissions){
    const feature=String(p?.feature||'').trim(),access=String(p?.access_level||'').trim();
    if(!FEATURE_CODES.has(feature)||!['view','edit'].includes(access))continue;
    const current=byFeature.get(feature);
    if(!current||access==='edit')byFeature.set(feature,{feature,access_level:access})
  }
  return [...byFeature.values()].sort((a,b)=>a.feature.localeCompare(b.feature))
}
function normalizeScopes(scopes){
  if(!Array.isArray(scopes))return [];
  const seen=new Set(),out=[];
  for(const s of scopes){const office=String(s?.office||'').trim(),department=String(s?.department||'').trim();if(!office||!department)continue;const key=office+'\u0000'+department;if(!seen.has(key)){seen.add(key);out.push({office,department})}}
  return out
}
async function listUsers(user,filters={}){
  assertFullAdmin(user);
  const params=[],where=['true'];
  const q=String(filters.q||'').trim(),role=String(filters.role_level||'').trim(),state=String(filters.state||'').trim();
  if(q){params.push('%'+q+'%');where.push(`(u.login_id ilike $${params.length} or u.display_name ilike $${params.length} or e.employee_no ilike $${params.length} or e.name ilike $${params.length})`)}
  if(role){params.push(role);where.push(`u.role_level=$${params.length}`)}
  if(state){params.push(state);where.push(`u.state=$${params.length}`)}
  const page=Math.max(1,Number.parseInt(filters.page,10)||1),pageSize=Math.min(100,Math.max(1,Number.parseInt(filters.page_size,10)||50)),offset=(page-1)*pageSize;
  params.push(pageSize,offset);
  const r=await query(`
    select u.id,u.employee_id,u.login_id,u.display_name,u.role_level,u.safety_authority,u.state,u.mfa_required,u.mfa_enrolled_at,u.last_login_at,u.locked_until,u.version,
           e.employee_no,e.name as employee_name,e.lifecycle_status,
           coalesce((select jsonb_agg(jsonb_build_object('office',s.office,'department',s.department) order by s.office,s.department) from user_scopes s where s.user_id=u.id),'[]'::jsonb) as scopes,
           coalesce((select jsonb_agg(jsonb_build_object('feature',p.feature,'access_level',p.access_level) order by p.feature) from user_feature_permissions p where p.user_id=u.id),'[]'::jsonb) as permissions,
           (select count(*)::int from auth_sessions a where a.user_id=u.id and a.revoked_at is null and a.expires_at>now()) as active_sessions,
           count(*) over()::int as _total
      from users u join employees e on e.id=u.employee_id
     where ${where.join(' and ')} order by u.display_name,u.id limit $${params.length-1} offset $${params.length}
  `,params);
  const total=r.rows[0]?Number(r.rows[0]._total):0;return {items:r.rows.map(({_total,...x})=>x),page,page_size:pageSize,total}
}
async function createUser({actor,employeeId,loginId,displayName,roleLevel='scoped',safetyAuthority=false,scopes=[],permissions=[],passwordHash,resetTokenHash,requestId}){
  assertFullAdmin(actor);
  return withTransaction(async client=>{
    const emp=(await query('select * from employees where id=$1 for update',[employeeId],client)).rows[0];
    if(!emp)throw problem(404,'EMPLOYEE_NOT_FOUND','対象社員が見つかりません');
    if(emp.lifecycle_status==='retired')throw problem(422,'EMPLOYEE_RETIRED','退職済み社員には利用者アカウントを発行できません');
    const id=String(loginId||'').trim();if(!id||id.length>128||/\s/.test(id))throw problem(422,'INVALID_LOGIN_ID','ログインIDを確認してください');
    if(!['full','scoped'].includes(roleLevel))throw problem(422,'INVALID_ROLE','本番利用者は全社管理者または範囲指定管理者のみ選択できます');
    const normalized=normalizeScopes(scopes);if(roleLevel==='scoped'&&!normalized.length)throw problem(422,'SCOPE_REQUIRED','範囲指定利用者には担当範囲が必要です');
    const normalizedPermissions=normalizePermissions(permissions);if(roleLevel==='scoped'&&!normalizedPermissions.length)throw problem(422,'PERMISSION_REQUIRED','範囲指定利用者には利用機能を1つ以上設定してください');
    const mfaRequired=true;
    const row=(await query(`insert into users(employee_id,login_id,password_hash,display_name,role_level,safety_authority,state,mfa_required) values($1,$2,$3,$4,$5,$6,'active',$7) returning id,employee_id,login_id,display_name,role_level,safety_authority,state,mfa_required,version`,[employeeId,id,passwordHash,String(displayName||emp.name).trim()||emp.name,roleLevel,Boolean(safetyAuthority),mfaRequired],client)).rows[0];
    for(const s of normalized)await query('insert into user_scopes(user_id,office,department) values($1,$2,$3)',[row.id,s.office,s.department],client);
    for(const p of (roleLevel==='scoped'?normalizedPermissions:[]))await query('insert into user_feature_permissions(user_id,feature,access_level) values($1,$2,$3)',[row.id,p.feature,p.access_level],client);
    await query(`insert into password_reset_tokens(user_id,token_hash,requested_by_user_id,expires_at) values($1,$2,$3,now()+interval '30 minutes')`,[row.id,resetTokenHash,actor.id],client);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'利用者発行','user',$2,$3,'success',$4,$5)`,[actor.id,row.id,employeeId,requestId,id+' / '+roleLevel],client);
    return {...row,employee_no:emp.employee_no,scopes:roleLevel==='scoped'?normalized:[],permissions:roleLevel==='scoped'?normalizedPermissions:[],setup_expires_in:1800}
  })
}
async function updateUserAccess({actor,userId,roleLevel,safetyAuthority,scopes,permissions,expectedVersion,requestId}){
  assertFullAdmin(actor);
  return withTransaction(async client=>{
    if(roleLevel&&String(roleLevel)!=='full')await lockFullAdminContinuity(client);
    const before=(await query(`select u.*,e.lifecycle_status from users u join employees e on e.id=u.employee_id where u.id=$1 for update`,[userId],client)).rows[0];
    if(!before)throw problem(404,'USER_NOT_FOUND','対象利用者が見つかりません');assertVersion(before,expectedVersion);
    const role=String(roleLevel||before.role_level);if(!['full','scoped'].includes(role))throw problem(422,'INVALID_ROLE','本番利用者は全社管理者または範囲指定管理者のみ選択できます');
    if(before.role_level==='full'&&before.state==='active'&&role!=='full')await requireOtherActiveFullAdmin([before.id],client);
    const normalized=normalizeScopes(scopes);if(role==='scoped'&&!normalized.length)throw problem(422,'SCOPE_REQUIRED','範囲指定利用者には担当範囲が必要です');
    const normalizedPermissions=normalizePermissions(permissions);if(role==='scoped'&&!normalizedPermissions.length)throw problem(422,'PERMISSION_REQUIRED','範囲指定利用者には利用機能を1つ以上設定してください');
    const mfaRequired=true;
    const after=(await query(`update users set role_level=$2,safety_authority=$3,mfa_required=$4,updated_at=now(),version=version+1 where id=$1 returning id,employee_id,login_id,display_name,role_level,safety_authority,state,mfa_required,mfa_enrolled_at,version`,[userId,role,Boolean(safetyAuthority),mfaRequired],client)).rows[0];
    await query('delete from user_scopes where user_id=$1',[userId],client);for(const s of (role==='scoped'?normalized:[]))await query('insert into user_scopes(user_id,office,department) values($1,$2,$3)',[userId,s.office,s.department],client);
    await query('delete from user_feature_permissions where user_id=$1',[userId],client);for(const p of (role==='scoped'?normalizedPermissions:[]))await query('insert into user_feature_permissions(user_id,feature,access_level) values($1,$2,$3)',[userId,p.feature,p.access_level],client);
    await query(`update auth_sessions set revoked_at=now(),revoke_reason='access_changed' where user_id=$1 and revoked_at is null`,[userId],client);
    await query(`insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason) values('user',$1,$2,$3,'access_change',$4::jsonb,$5::jsonb,'権限変更')`,[userId,before.employee_id,actor.id,JSON.stringify({role_level:before.role_level,safety_authority:before.safety_authority}),JSON.stringify({role_level:role,safety_authority:Boolean(safetyAuthority),scopes:role==='scoped'?normalized:[],permissions:role==='scoped'?normalizedPermissions:[]})],client);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'利用者権限変更','user',$2,$3,'success',$4,$5)`,[actor.id,userId,before.employee_id,requestId,before.role_level+' → '+role],client);
    return {...after,scopes:role==='scoped'?normalized:[],permissions:role==='scoped'?normalizedPermissions:[]}
  })
}
async function setUserState({actor,userId,state,expectedVersion,reason,requestId}){
  assertFullAdmin(actor);if(!['active','suspended'].includes(state))throw problem(422,'INVALID_USER_STATE','利用者状態を確認してください');if(!String(reason||'').trim())throw problem(422,'REASON_REQUIRED','理由を入力してください');
  return withTransaction(async client=>{
    if(state==='suspended')await lockFullAdminContinuity(client);
    const before=(await query(`select u.*,e.lifecycle_status from users u join employees e on e.id=u.employee_id where u.id=$1 for update`,[userId],client)).rows[0];if(!before)throw problem(404,'USER_NOT_FOUND','対象利用者が見つかりません');assertVersion(before,expectedVersion);
    if(state==='active'&&before.lifecycle_status==='retired')throw problem(422,'EMPLOYEE_RETIRED','退職済み社員のアカウントは再有効化できません');
    if(state==='suspended'&&before.state==='active'&&before.role_level==='full')await requireOtherActiveFullAdmin([before.id],client);
    const after=(await query(`update users set state=$2,failed_login_count=case when $2='active' then 0 else failed_login_count end,locked_until=case when $2='active' then null else locked_until end,updated_at=now(),version=version+1 where id=$1 returning id,employee_id,login_id,display_name,role_level,safety_authority,state,mfa_required,mfa_enrolled_at,version`,[userId,state],client)).rows[0];
    const sessions=await query(`update auth_sessions set revoked_at=now(),revoke_reason=$2 where user_id=$1 and revoked_at is null returning id`,[userId,state==='suspended'?'account_suspended':'account_reactivated'],client);
    let invalidatedMfa=0,invalidatedReset=0;
    if(state==='suspended'){
      invalidatedMfa=(await query(`update mfa_challenges set verified_at=now() where user_id=$1 and verified_at is null returning id`,[userId],client)).rows.length;
      invalidatedReset=(await query(`update password_reset_tokens set used_at=now() where user_id=$1 and used_at is null returning id`,[userId],client)).rows.length
    }
    const summary=String(reason)+(state==='suspended'?` / sessions ${sessions.rows.length}件失効 / pending MFA ${invalidatedMfa}件無効 / reset ${invalidatedReset}件無効`:'');
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,$2,'user',$3,$4,'success',$5,$6)`,[actor.id,state==='suspended'?'利用者停止':'利用者再開',userId,before.employee_id,requestId,summary],client);
    return after
  })
}
async function issuePasswordReset({actor,userId,tokenHash,requestId}){
  assertFullAdmin(actor);return withTransaction(async client=>{
    const u=(await query('select id,employee_id,state from users where id=$1 for update',[userId],client)).rows[0];if(!u)throw problem(404,'USER_NOT_FOUND','対象利用者が見つかりません');
    await query(`update password_reset_tokens set used_at=now() where user_id=$1 and used_at is null`,[userId],client);
    await query(`update mfa_challenges set verified_at=now() where user_id=$1 and verified_at is null`,[userId],client);
    const token=(await query(`insert into password_reset_tokens(user_id,token_hash,requested_by_user_id,expires_at) values($1,$2,$3,now()+interval '20 minutes') returning id,expires_at`,[userId,tokenHash,actor.id],client)).rows[0];
    await query(`update auth_sessions set revoked_at=now(),revoke_reason='password_reset_issued' where user_id=$1 and revoked_at is null`,[userId],client);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'パスワード再設定発行','user',$2,$3,'success',$4,'期限付き再設定')`,[actor.id,userId,u.employee_id,requestId],client);return token
  })
}
async function completePasswordReset({tokenHash,passwordHash,requestId}){
  return withTransaction(async client=>{
    const t=(await query(`select p.*,u.employee_id from password_reset_tokens p join users u on u.id=p.user_id where p.token_hash=$1 and p.used_at is null and p.expires_at>now() for update`,[tokenHash],client)).rows[0];
    if(!t)throw problem(401,'RESET_TOKEN_INVALID','再設定リンクが無効または期限切れです');
    await query('select id from users where id=$1 for update',[t.user_id],client);
    await query(`update users set password_hash=$2,password_changed_at=now(),failed_login_count=0,locked_until=null,updated_at=now(),version=version+1 where id=$1`,[t.user_id,passwordHash],client);
    await query(`update password_reset_tokens set used_at=now() where user_id=$1 and used_at is null`,[t.user_id],client);
    await query(`update mfa_challenges set verified_at=now() where user_id=$1 and verified_at is null`,[t.user_id],client);
    await query(`update auth_sessions set revoked_at=now(),revoke_reason='password_reset_completed' where user_id=$1 and revoked_at is null`,[t.user_id],client);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'パスワード再設定完了','user',$2,$3,'success',$4,'パスワードハッシュ更新・全セッション失効')`,[t.requested_by_user_id,t.user_id,t.employee_id,requestId],client);return {user_id:t.user_id}
  })
}
module.exports={listUsers,createUser,updateUserAccess,setUserState,issuePasswordReset,completePasswordReset,normalizeScopes,normalizePermissions,assertFullAdmin,FEATURE_CODES};
