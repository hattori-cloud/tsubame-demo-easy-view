const {query,withTransaction}=require('./db');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function monthStart(value){
  const m=/^(\d{4})-(\d{2})$/.exec(String(value||'').trim());
  if(!m||Number(m[2])<1||Number(m[2])>12)throw problem(422,'INVALID_MONTH','対象月はYYYY-MMで指定してください');
  return m[1]+'-'+m[2]+'-01'
}
function snapshotScopeSql(user,params,alias='c'){
  if(user.role_level==='full')return 'true';
  if(user.role_level==='self'){params.push(user.employee_id);return `${alias}.employee_id=$${params.length}`}
  if(user.role_level==='scoped'){
    const scopes=user.scopes||[];if(!scopes.length)return 'false';
    return '('+scopes.map(s=>{params.push(s.office,s.department);return `(${alias}.office_snapshot=$${params.length-1} and ${alias}.department_snapshot=$${params.length})`}).join(' or ')+')'
  }
  return 'false'
}
async function listCompliance(user,filters={}){
  const month=monthStart(filters.month),params=[month],where=[`c.month_start=$1`,snapshotScopeSql(user,params,'c')];
  if(filters.office){params.push(String(filters.office));where.push(`c.office_snapshot=$${params.length}`)}
  if(filters.state){params.push(String(filters.state));where.push(`c.compliance_state=$${params.length}`)}
  const q=String(filters.q||'').trim();if(q){params.push('%'+q+'%');where.push(`(c.employee_no_snapshot ilike $${params.length} or c.employee_name_snapshot ilike $${params.length})`)}
  const summary=(await query(`
    select count(*)::int as target_driver_count,
           count(*) filter(where c.compliance_state='met')::int as met_count,
           count(*) filter(where c.compliance_state='short')::int as short_count,
           count(*) filter(where c.compliance_state='zero')::int as zero_count,
           count(*) filter(where c.compliance_state='exempt')::int as exempt_count,
           coalesce(sum(c.target_count) filter(where c.requirement_state='required'),0)::int as required_report_total,
           coalesce(sum(c.submitted_count),0)::int as submitted_report_total
      from near_miss_monthly_compliance c where ${where.join(' and ')}
  `,params)).rows[0];
  const page=Math.max(1,Number.parseInt(filters.page,10)||1),pageSize=Math.min(100,Math.max(1,Number.parseInt(filters.page_size,10)||50)),offset=(page-1)*pageSize;
  const listParams=[...params,pageSize,offset];
  const rows=(await query(`
    select c.* from near_miss_monthly_compliance c
     where ${where.join(' and ')}
  order by case c.compliance_state when 'zero' then 0 when 'short' then 1 when 'met' then 2 else 3 end,c.employee_no_snapshot,c.employee_id
     limit $${listParams.length-1} offset $${listParams.length}
  `,listParams)).rows;
  return {month:month.slice(0,7),summary,items:rows,page,page_size:pageSize}
}
async function createMonthlySnapshot({user,month,requestId}){
  if(user.role_level!=='full')throw problem(403,'FULL_ADMIN_REQUIRED','月次対象者の確定は全社管理者のみ実行できます');
  const start=monthStart(month);
  return withTransaction(async client=>{
    const existing=Number((await query('select count(*)::int as n from near_miss_monthly_targets where month_start=$1',[start],client)).rows[0]?.n||0);
    if(existing)throw problem(409,'MONTHLY_TARGET_ALREADY_EXISTS','この月の対象者スナップショットは既に作成済みです');
    const inserted=await query(`
      insert into near_miss_monthly_targets(month_start,employee_id,employee_no_snapshot,employee_name_snapshot,office_snapshot,department_snapshot,target_count,requirement_state,created_by_user_id,updated_by_user_id)
      select $1,e.id,e.employee_no,e.name,e.office,e.department,2,'required',$2,$2
        from employees e
       where e.lifecycle_status='active'
         and e.department like 'タクシー%'
         and coalesce(e.position,'')='乗務員'
      on conflict(month_start,employee_id) do nothing
      returning id
    `,[start,user.id],client);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,result,request_id,summary) values($1,'ヒヤリ月次対象確定','near_miss_monthly_targets',$2,'success',$3,$4)`,[user.id,start,requestId,start+' / '+inserted.rowCount+'名'],client);
    return {month:start.slice(0,7),target_count:inserted.rowCount}
  })
}
async function addMonthlyTarget({user,body,requestId}){
  if(user.role_level!=='full')throw problem(403,'FULL_ADMIN_REQUIRED','月次対象者追加は全社管理者のみ実行できます');
  const start=monthStart(body.month),employeeId=String(body.employee_id||''),target=Math.max(0,Math.min(31,Number.parseInt(body.target_count,10)||2)),state=String(body.requirement_state||'required'),reason=String(body.exemption_reason||'').trim();
  if(!['required','exempt'].includes(state))throw problem(422,'INVALID_REQUIREMENT_STATE','対象状態を確認してください');
  if(state==='exempt'&&!reason)throw problem(422,'EXEMPTION_REASON_REQUIRED','免除理由を入力してください');
  return withTransaction(async client=>{
    const e=(await query('select * from employees where id=$1',[employeeId],client)).rows[0];if(!e)throw problem(404,'EMPLOYEE_NOT_FOUND','対象社員が見つかりません');
    const row=(await query(`
      insert into near_miss_monthly_targets(month_start,employee_id,employee_no_snapshot,employee_name_snapshot,office_snapshot,department_snapshot,target_count,requirement_state,exemption_reason,created_by_user_id,updated_by_user_id)
      values($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$10)
      on conflict(month_start,employee_id) do nothing
      returning *
    `,[start,e.id,e.employee_no,e.name,e.office,e.department,target,state,state==='exempt'?reason:null,user.id],client)).rows[0];
    if(!row)throw problem(409,'MONTHLY_TARGET_EXISTS','この社員は対象月に既に登録されています');
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'ヒヤリ月次対象追加','near_miss_monthly_target',$2,$3,'success',$4,$5)`,[user.id,row.id,e.id,requestId,start+' / '+state+' / '+target+'件'],client);return row
  })
}
async function updateMonthlyTarget({user,id,body,expectedVersion,requestId}){
  if(user.role_level!=='full')throw problem(403,'FULL_ADMIN_REQUIRED','月次対象者変更は全社管理者のみ実行できます');
  return withTransaction(async client=>{
    const before=(await query('select * from near_miss_monthly_targets where id=$1 for update',[id],client)).rows[0];if(!before)throw problem(404,'NOT_FOUND','月次対象者が見つかりません');
    if(Number(before.version)!==Number(expectedVersion))throw problem(409,'VERSION_CONFLICT','別の利用者が先に更新しています。最新データを読み直してください');
    const state=String(body.requirement_state??before.requirement_state),target=body.target_count===undefined?before.target_count:Math.max(0,Math.min(31,Number.parseInt(body.target_count,10)||0)),reason=String(body.exemption_reason??before.exemption_reason??'').trim();
    if(!['required','exempt'].includes(state))throw problem(422,'INVALID_REQUIREMENT_STATE','対象状態を確認してください');
    if(state==='exempt'&&!reason)throw problem(422,'EXEMPTION_REASON_REQUIRED','免除理由を入力してください');
    const after=(await query(`update near_miss_monthly_targets set target_count=$2,requirement_state=$3,exemption_reason=$4,updated_by_user_id=$5,updated_at=now(),version=version+1 where id=$1 returning *`,[id,target,state,state==='exempt'?reason:null,user.id],client)).rows[0];
    await query(`insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason) values('near_miss_monthly_target',$1,$2,$3,'target_change',$4::jsonb,$5::jsonb,$6)`,[id,before.employee_id,user.id,JSON.stringify({target_count:before.target_count,requirement_state:before.requirement_state,exemption_reason:before.exemption_reason}),JSON.stringify({target_count:after.target_count,requirement_state:after.requirement_state,exemption_reason:after.exemption_reason}),reason],client);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'ヒヤリ月次対象変更','near_miss_monthly_target',$2,$3,'success',$4,$5)`,[user.id,id,before.employee_id,requestId,state+' / '+target+'件'],client);return after
  })
}
module.exports={listCompliance,createMonthlySnapshot,addMonthlyTarget,updateMonthlyTarget,monthStart,snapshotScopeSql};
