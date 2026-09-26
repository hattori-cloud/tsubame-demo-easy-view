const {query,withTransaction}=require('./db');
const {scopeSql}=require('./employee-store');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function manager(user){if(!user||!['full','scoped'].includes(user.role_level))throw problem(403,'MANAGER_REQUIRED','管理者権限が必要です');return user}
function assertVersion(row,expected){if(Number(row.version)!==Number(expected))throw problem(409,'VERSION_CONFLICT','別の利用者が先に更新しています。最新データを読み直してください')}
async function employeeForUser(user,employeeId,client=null){
  const params=[employeeId],scope=scopeSql(user,params,'e');
  const r=await query(`select e.* from employees e where e.id=$1 and ${scope} limit 1`,params,client);
  if(!r.rows[0])throw problem(404,'NOT_FOUND','対象社員が見つかりません');
  return r.rows[0]
}
async function listDrafts(user){
  return (await query(`select id,kind,saved_at,version from drafts where owner_user_id=$1 order by saved_at desc`,[user.id])).rows
}
async function getDraft(user,kind){
  const r=await query(`select * from drafts where owner_user_id=$1 and kind=$2 limit 1`,[user.id,kind]);
  return r.rows[0]||null
}
async function saveDraft({user,kind,payload,expectedVersion}){
  if(!['accident','near_miss','complaint'].includes(kind))throw problem(422,'INVALID_DRAFT_KIND','下書き種別を確認してください');
  return withTransaction(async client=>{
    const current=(await query(`select * from drafts where owner_user_id=$1 and kind=$2 for update`,[user.id,kind],client)).rows[0];
    if(current){
      if(expectedVersion===null||expectedVersion===undefined)throw problem(428,'PRECONDITION_REQUIRED','既存下書きの更新にはIf-Matchが必要です');
      assertVersion(current,expectedVersion);
      return (await query(`update drafts set payload=$3::jsonb,saved_at=now(),version=version+1 where owner_user_id=$1 and kind=$2 returning *`,[user.id,kind,JSON.stringify(payload||{})],client)).rows[0]
    }
    return (await query(`insert into drafts(owner_user_id,kind,payload) values($1,$2,$3::jsonb) returning *`,[user.id,kind,JSON.stringify(payload||{})],client)).rows[0]
  })
}
async function deleteDraft({user,kind}){
  const r=await query(`delete from drafts where owner_user_id=$1 and kind=$2 returning id`,[user.id,kind]);
  return Boolean(r.rows[0])
}
async function listHandoffs(user){
  manager(user);
  if(user.role_level==='full')return (await query(`select h.* from handoffs h order by h.status,h.created_at desc limit 200`)).rows;
  const params=[],scope=scopeSql(user,params,'e');params.push(user.id);const uid=params.length;
  return (await query(`select h.* from handoffs h left join employees e on e.id=h.employee_id where h.to_user_id=$${uid} or h.from_user_id=$${uid} or (h.employee_id is not null and ${scope}) order by h.status,h.created_at desc limit 200`,params)).rows
}
async function createHandoff({user,body,requestId}){
  manager(user);return withTransaction(async client=>{
    const employeeId=body.employee_id?String(body.employee_id):null;
    if(user.role_level==='scoped'&&!employeeId)throw problem(422,'EMPLOYEE_REQUIRED_FOR_SCOPED_HANDOFF','担当範囲管理者の引継ぎには対象社員が必要です');
    const employee=employeeId?await employeeForUser(user,employeeId,client):null;
    const targetId=String(body.to_user_id||'').trim();
    const params=[targetId],where=[`u.id=$1`,`u.state='active'`,`u.role_level in ('full','scoped')`];
    if(employee){
      params.push(employee.office,employee.department);
      where.push(`(u.role_level='full' or exists(select 1 from user_scopes s where s.user_id=u.id and s.office=$2 and s.department=$3))`)
    }
    const to=(await query(`select u.id,u.role_level,u.state from users u where ${where.join(' and ')} limit 1`,params,client)).rows[0];
    if(!to)throw problem(422,'TARGET_USER_NOT_AUTHORIZED','引継ぎ先は対象社員を担当できる有効な管理者から選択してください');
    const type=String(body.case_type||'').trim(),caseId=String(body.case_id||'').trim();if(!type||!caseId)throw problem(422,'CASE_REQUIRED','引継ぎ対象を指定してください');
    const row=(await query(`insert into handoffs(case_type,case_id,employee_id,from_user_id,to_user_id,status,note) values($1,$2,$3,$4,$5,'pending',$6) returning *`,[type,caseId,employeeId,user.id,to.id,body.note||null],client)).rows[0];
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'引継ぎ作成','handoff',$2,$3,'success',$4,$5)`,[user.id,row.id,employeeId,requestId,type+' / '+caseId],client);return row
  })
}
async function acknowledgeHandoff({user,id,requestId}){
  manager(user);return withTransaction(async client=>{
    const before=(await query(`select * from handoffs where id=$1 and to_user_id=$2 and status='pending' for update`,[id,user.id],client)).rows[0];if(!before)throw problem(404,'NOT_FOUND','確認可能な引継ぎが見つかりません');
    const row=(await query(`update handoffs set status='acknowledged',acknowledged_at=now() where id=$1 returning *`,[id],client)).rows[0];
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'引継ぎ確認','handoff',$2,$3,'success',$4,'確認済み')`,[user.id,id,before.employee_id,requestId],client);return row
  })
}
module.exports={listDrafts,getDraft,saveDraft,deleteDraft,listHandoffs,createHandoff,acknowledgeHandoff};
