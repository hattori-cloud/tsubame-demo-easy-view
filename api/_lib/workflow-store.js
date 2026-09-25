const {query,withTransaction}=require('./db');
const {scopeSql}=require('./employee-store');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function manager(user){if(!user||!['full','scoped'].includes(user.role_level))throw problem(403,'MANAGER_REQUIRED','管理者権限が必要です');return user}
function full(user){if(!user||user.role_level!=='full')throw problem(403,'FULL_ADMIN_REQUIRED','全社管理者権限が必要です');return user}
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
async function listApplications(user,filters={}){
  const params=[],where=[scopeSql(user,params,'e')];
  if(filters.status){params.push(String(filters.status));where.push(`a.status=$${params.length}`)}
  const page=Math.max(1,Number.parseInt(filters.page,10)||1),pageSize=Math.min(100,Math.max(1,Number.parseInt(filters.page_size,10)||50)),offset=(page-1)*pageSize;
  params.push(pageSize,offset);
  const r=await query(`select a.*,e.employee_no,e.name as employee_name,count(*) over()::int as _total from applications a join employees e on e.id=a.employee_id where ${where.join(' and ')} order by a.applied_at desc,a.id desc limit $${params.length-1} offset $${params.length}`,params);
  const total=r.rows[0]?Number(r.rows[0]._total):0;return {items:r.rows.map(({_total,...x})=>x),page,page_size:pageSize,total}
}
async function createApplication({user,body,requestId}){
  return withTransaction(async client=>{
    const employeeId=user.role_level==='self'?user.employee_id:String(body.employee_id||'');
    const employee=await employeeForUser(user,employeeId,client),type=String(body.type||'').trim();if(!type)throw problem(422,'TYPE_REQUIRED','申請種別を入力してください');
    const row=(await query(`insert into applications(employee_id,type,status,payload) values($1,$2,'submitted',$3::jsonb) returning *`,[employee.id,type,JSON.stringify(body.payload||{})],client)).rows[0];
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'申請登録','application',$2,$3,'success',$4,$5)`,[user.id,row.id,employee.id,requestId,type],client);return row
  })
}
async function updateApplication({user,id,body,expectedVersion,requestId}){
  manager(user);return withTransaction(async client=>{
    const params=[id],scope=scopeSql(user,params,'e');
    const before=(await query(`select a.* from applications a join employees e on e.id=a.employee_id where a.id=$1 and ${scope} for update`,params,client)).rows[0];
    if(!before)throw problem(404,'NOT_FOUND','対象申請が見つかりません');assertVersion(before,expectedVersion);
    const status=String(body.status||before.status),payload=Object.prototype.hasOwnProperty.call(body||{},'payload')?body.payload:before.payload;
    const decided=['approved','rejected','cancelled'].includes(status);
    const after=(await query(`update applications set status=$2,payload=$3::jsonb,decided_at=case when $4 then now() else decided_at end,decided_by_user_id=case when $4 then $5 else decided_by_user_id end,updated_at=now(),version=version+1 where id=$1 returning *`,[id,status,JSON.stringify(payload||{}),decided,user.id],client)).rows[0];
    await query(`insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason) values('application',$1,$2,$3,'update',$4::jsonb,$5::jsonb,'申請処理')`,[id,before.employee_id,user.id,JSON.stringify({status:before.status,payload:before.payload}),JSON.stringify({status:after.status,payload:after.payload})],client);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'申請更新','application',$2,$3,'success',$4,$5)`,[user.id,id,before.employee_id,requestId,before.status+' → '+after.status],client);return after
  })
}
async function listNotices(user,filters={}){
  const includeDrafts=user.role_level==='full'&&String(filters.state||'')==='all';
  const r=await query(`
    select n.*,exists(select 1 from notice_reads nr where nr.notice_id=n.id and nr.user_id=$1) as read
      from notices n
     where ${includeDrafts?'true':"n.state='published' and (n.published_at is null or n.published_at<=now())"}
  order by n.published_at desc nulls last,n.created_at desc
     limit 100
  `,[user.id]);return r.rows
}
async function saveNotice({user,id=null,body,expectedVersion,requestId}){
  full(user);const title=String(body.title||'').trim(),text=String(body.body||'').trim();if(!title||!text)throw problem(422,'REQUIRED_FIELDS','件名・本文を入力してください');
  return withTransaction(async client=>{
    let row,before=null;
    if(id){
      before=(await query('select * from notices where id=$1 for update',[id],client)).rows[0];if(!before)throw problem(404,'NOT_FOUND','お知らせが見つかりません');assertVersion(before,expectedVersion);
      row=(await query(`update notices set title=$2,body=$3,state=$4,published_at=case when $4='published' then coalesce(published_at,now()) else published_at end,updated_at=now(),version=version+1 where id=$1 returning *`,[id,title,text,body.state||before.state],client)).rows[0]
    }else row=(await query(`insert into notices(title,body,state,published_at,created_by_user_id) values($1,$2,$3,case when $3='published' then now() end,$4) returning *`,[title,text,body.state||'draft',user.id],client)).rows[0];
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,result,request_id,summary) values($1,$2,'notice',$3,'success',$4,$5)`,[user.id,id?'お知らせ更新':'お知らせ作成',row.id,requestId,title],client);return row
  })
}
async function markNoticeRead(user,noticeId){
  await query(`insert into notice_reads(notice_id,user_id) select id,$2 from notices where id=$1 and state='published' on conflict(notice_id,user_id) do update set read_at=excluded.read_at`,[noticeId,user.id]);
  return {read:true}
}
async function listConfirmations(user){
  return (await query(`
    select c.*,r.response,r.responded_at
      from confirmations c
 left join confirmation_responses r on r.confirmation_id=c.id and r.user_id=$1
     where c.state<>'draft'
  order by c.due nulls last,c.created_at desc
     limit 100
  `,[user.id])).rows
}
async function saveConfirmation({user,id=null,body,expectedVersion,requestId}){
  full(user);const title=String(body.title||'').trim();if(!title)throw problem(422,'TITLE_REQUIRED','確認件名を入力してください');
  return withTransaction(async client=>{
    let row,before=null;
    if(id){before=(await query('select * from confirmations where id=$1 for update',[id],client)).rows[0];if(!before)throw problem(404,'NOT_FOUND','一斉確認が見つかりません');assertVersion(before,expectedVersion);row=(await query(`update confirmations set title=$2,body=$3,due=$4,state=$5,updated_at=now(),version=version+1 where id=$1 returning *`,[id,title,body.body??before.body,body.due??before.due,body.state||before.state],client)).rows[0]}
    else row=(await query(`insert into confirmations(title,body,due,state,created_by_user_id) values($1,$2,$3,$4,$5) returning *`,[title,body.body||null,body.due||null,body.state||'open',user.id],client)).rows[0];
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,result,request_id,summary) values($1,$2,'confirmation',$3,'success',$4,$5)`,[user.id,id?'一斉確認更新':'一斉確認作成',row.id,requestId,title],client);return row
  })
}
async function respondConfirmation({user,confirmationId,response,requestId}){
  const value=String(response||'').trim();if(!value)throw problem(422,'RESPONSE_REQUIRED','回答を入力してください');if(!user.employee_id)throw problem(422,'EMPLOYEE_LINK_REQUIRED','社員台帳との紐付けが必要です');
  return withTransaction(async client=>{
    const c=(await query(`select * from confirmations where id=$1 and state='open' for update`,[confirmationId],client)).rows[0];if(!c)throw problem(404,'NOT_FOUND','回答可能な一斉確認が見つかりません');
    const row=(await query(`insert into confirmation_responses(confirmation_id,user_id,employee_id,response) values($1,$2,$3,$4) on conflict(confirmation_id,user_id) do update set response=excluded.response,responded_at=now() returning *`,[confirmationId,user.id,user.employee_id,value],client)).rows[0];
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'一斉確認回答','confirmation',$2,$3,'success',$4,'回答済み')`,[user.id,confirmationId,user.employee_id,requestId],client);return row
  })
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
module.exports={listDrafts,getDraft,saveDraft,deleteDraft,listApplications,createApplication,updateApplication,listNotices,saveNotice,markNoticeRead,listConfirmations,saveConfirmation,respondConfirmation,listHandoffs,createHandoff,acknowledgeHandoff};
