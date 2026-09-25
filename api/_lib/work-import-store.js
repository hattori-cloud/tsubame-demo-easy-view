const {query,withTransaction}=require('./db');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function requireFullAdmin(user){if(!user||user.role_level!=='full')throw problem(403,'FULL_ADMIN_REQUIRED','勤務集計の取込は全社管理者のみ操作できます')}
function roundHours(v){const n=Number(v);if(!Number.isFinite(n))throw problem(422,'INVALID_WORK_HOURS','勤務時間を確認してください');return Math.round(n*100)/100}
function monthStart(month){const s=String(month||'');if(!/^\d{4}-\d{2}$/.test(s))throw problem(422,'INVALID_WORK_MONTH','対象月を確認してください');return s+'-01'}
function summarySnapshot(row){
  if(!row)return null;
  return {id:row.id,employee_id:row.employee_id,month_start:String(row.month_start).slice(0,10),restraint_hours:Number(row.restraint_hours),remaining_hours:Number(row.remaining_hours),overtime_hours:Number(row.overtime_hours),last_posted:String(row.last_posted).slice(0,10),source_batch_id:row.source_batch_id||null}
}
async function resolveEmployees(employeeNos,client){
  const unique=[...new Set(employeeNos.map(x=>String(x).trim()).filter(Boolean))];
  const r=await query("with requested(employee_no) as (select unnest($1::text[])) select r.employee_no,e.id from requested r join employees e on e.employee_no=r.employee_no union select r.employee_no,e.id from requested r join employee_number_history h on h.old_employee_no=r.employee_no join employees e on e.id=h.employee_id",[unique],client);
  const map=new Map(unique.map(x=>[x,new Set()]));
  for(const row of r.rows){if(map.has(row.employee_no))map.get(row.employee_no).add(row.id)}
  const missing=[],ambiguous=[],resolved=new Map();
  for(const [no,ids] of map){if(ids.size===0)missing.push(no);else if(ids.size>1)ambiguous.push(no);else resolved.set(no,[...ids][0])}
  if(missing.length)throw problem(422,'EMPLOYEE_NUMBER_NOT_FOUND','社員番号が社員台帳に見つかりません: '+missing.slice(0,20).join(', '));
  if(ambiguous.length)throw problem(409,'EMPLOYEE_NUMBER_AMBIGUOUS','旧社員番号を含め複数社員に一致する番号があります: '+ambiguous.slice(0,20).join(', '));
  return resolved
}

async function commitWorkImport({user,fileName,sha256,rows,requestId}){
  requireFullAdmin(user);
  if(!/^[0-9a-f]{64}$/.test(String(sha256||'')))throw problem(422,'INVALID_FILE_HASH','取込ファイルのSHA-256を確認してください');
  if(!Array.isArray(rows)||!rows.length)throw problem(422,'NO_IMPORT_ROWS','取込対象行がありません');
  return withTransaction(async client=>{
    await query('select pg_advisory_xact_lock(hashtext($1))',['work_import:'+sha256],client);
    const duplicate=(await query("select id from work_import_batches where sha256=$1 and status='committed' limit 1",[sha256],client)).rows[0];
    if(duplicate)throw problem(409,'IMPORT_ALREADY_COMMITTED','同じファイルはすでに取込済みです');
    const employees=await resolveEmployees(rows.map(x=>x.employee_no),client);
    const batch=(await query("insert into work_import_batches(file_name,sha256,row_count,status,imported_by_user_id) values($1,$2,$3,'committing',$4) returning *",[String(fileName||'work-summary.xlsx').slice(0,255),sha256,rows.length,user.id],client)).rows[0];
    let inserted=0,updated=0,unchanged=0;
    for(const item of rows){
      const employeeId=employees.get(String(item.employee_no).trim());
      const month=monthStart(item.month);
      const next={restraint_hours:roundHours(item.restraint),remaining_hours:roundHours(item.remaining),overtime_hours:roundHours(item.overtime),last_posted:String(item.last_posted||'').slice(0,10)};
      if(!/^\d{4}-\d{2}-\d{2}$/.test(next.last_posted))throw problem(422,'INVALID_LAST_POSTED','最終計上日を確認してください');
      const before=(await query('select * from work_monthly_summaries where employee_id=$1 and month_start=$2::date for update',[employeeId,month],client)).rows[0]||null;
      if(!before){
        const after=(await query("insert into work_monthly_summaries(employee_id,month_start,restraint_hours,remaining_hours,overtime_hours,last_posted,source_batch_id) values($1,$2::date,$3,$4,$5,$6::date,$7) returning *",[employeeId,month,next.restraint_hours,next.remaining_hours,next.overtime_hours,next.last_posted,batch.id],client)).rows[0];
        await query("insert into work_import_changes(batch_id,summary_id,employee_id,month_start,action,before_data,after_data) values($1,$2,$3,$4::date,'insert',null,$5::jsonb)",[batch.id,after.id,employeeId,month,JSON.stringify(summarySnapshot(after))],client);
        inserted++;continue
      }
      const same=Number(before.restraint_hours)===next.restraint_hours&&Number(before.remaining_hours)===next.remaining_hours&&Number(before.overtime_hours)===next.overtime_hours&&String(before.last_posted).slice(0,10)===next.last_posted;
      if(same){unchanged++;continue}
      const beforeSnapshot=summarySnapshot(before);
      const after=(await query("update work_monthly_summaries set restraint_hours=$3,remaining_hours=$4,overtime_hours=$5,last_posted=$6::date,source_batch_id=$7,updated_at=now(),version=version+1 where id=$1 and employee_id=$2 returning *",[before.id,employeeId,next.restraint_hours,next.remaining_hours,next.overtime_hours,next.last_posted,batch.id],client)).rows[0];
      await query("insert into work_import_changes(batch_id,summary_id,employee_id,month_start,action,before_data,after_data) values($1,$2,$3,$4::date,'update',$5::jsonb,$6::jsonb)",[batch.id,after.id,employeeId,month,JSON.stringify(beforeSnapshot),JSON.stringify(summarySnapshot(after))],client);
      updated++
    }
    const committed=(await query("update work_import_batches set status='committed',inserted_count=$2,updated_count=$3,unchanged_count=$4,committed_at=now() where id=$1 returning *",[batch.id,inserted,updated,unchanged],client)).rows[0];
    await query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,result,request_id,summary) values($1,'勤務集計取込','work_import',$2,'success',$3,$4)",[user.id,batch.id,requestId,'rows '+rows.length+' / insert '+inserted+' / update '+updated+' / unchanged '+unchanged],client);
    return committed
  })
}

async function listWorkImports({user,filters={}}){
  requireFullAdmin(user);
  const page=Math.max(1,Number.parseInt(filters.page,10)||1),pageSize=Math.min(100,Math.max(1,Number.parseInt(filters.page_size,10)||50)),offset=(page-1)*pageSize;
  const params=[],where=['true'];const status=String(filters.status||'').trim();if(status){params.push(status);where.push('b.status=$'+params.length)}
  params.push(pageSize,offset);
  const r=await query("select b.*,u.display_name as imported_by_name,count(*) over()::int as _total from work_import_batches b left join users u on u.id=b.imported_by_user_id where "+where.join(' and ')+" order by b.created_at desc,b.id desc limit $"+(params.length-1)+" offset $"+params.length,params);
  const total=r.rows[0]?Number(r.rows[0]._total):0;return {items:r.rows.map(({_total,...x})=>x),page,page_size:pageSize,total}
}

async function rollbackWorkImport({user,batchId,reason,requestId}){
  requireFullAdmin(user);
  const clean=String(reason||'').trim();if(clean.length<3)throw problem(422,'ROLLBACK_REASON_REQUIRED','ロールバック理由を入力してください');
  return withTransaction(async client=>{
    const batch=(await query('select * from work_import_batches where id=$1 for update',[batchId],client)).rows[0];
    if(!batch)throw problem(404,'IMPORT_NOT_FOUND','取込履歴が見つかりません');
    if(batch.status!=='committed')throw problem(409,'IMPORT_NOT_ROLLBACKABLE','この取込はロールバックできません');
    const changes=(await query('select * from work_import_changes where batch_id=$1 order by occurred_at desc,id desc',[batchId],client)).rows;
    for(const change of changes){
      const current=(await query('select * from work_monthly_summaries where id=$1 for update',[change.summary_id],client)).rows[0]||null;
      if(!current||String(current.source_batch_id||'')!==String(batchId))throw problem(409,'ROLLBACK_CONFLICT','この取込後に勤務集計が変更されています。先に後続変更を確認してください');
      if(change.action==='insert')await query('delete from work_monthly_summaries where id=$1 and source_batch_id=$2',[change.summary_id,batchId],client);
      else{const before=change.before_data||{};await query('update work_monthly_summaries set restraint_hours=$2,remaining_hours=$3,overtime_hours=$4,last_posted=$5::date,source_batch_id=$6,updated_at=now(),version=version+1 where id=$1',[change.summary_id,before.restraint_hours,before.remaining_hours,before.overtime_hours,before.last_posted,before.source_batch_id||null],client)}
    }
    const rolled=(await query("update work_import_batches set status='rolled_back',rolled_back_at=now(),rolled_back_by_user_id=$2,rollback_reason=$3 where id=$1 returning *",[batchId,user.id,clean],client)).rows[0];
    await query("insert into audit_logs(actor_user_id,action,entity_type,entity_id,result,request_id,summary) values($1,'勤務集計ロールバック','work_import',$2,'success',$3,$4)",[user.id,batchId,requestId,clean],client);
    return rolled
  })
}

module.exports={commitWorkImport,listWorkImports,rollbackWorkImport,resolveEmployees,summarySnapshot};
