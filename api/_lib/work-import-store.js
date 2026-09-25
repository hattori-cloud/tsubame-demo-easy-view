const {query,withTransaction}=require('./db');

function problem(status,code,message){
  const e=new Error(message);e.status=status;e.code=code;return e
}
function requireFullAdmin(user){
  if(!user||user.role_level!=='full')throw problem(403,'FULL_ADMIN_REQUIRED','勤務集計の取込は全社管理者のみ利用できます')
}
function checkVersion(row,expectedVersion){
  if(Number(row.version)!==Number(expectedVersion))throw problem(409,'VERSION_CONFLICT','別の利用者が先に更新しています。最新データを読み直してください')
}
function monthStart(month){
  const s=String(month||'');
  if(!/^\d{4}-\d{2}$/.test(s))throw problem(422,'INVALID_IMPORT_MONTH','勤務集計の対象月を確認してください');
  return s+'-01'
}
function summaryData(row){
  return {
    restraint_hours:Number(row.restraint),
    remaining_hours:Number(row.remaining),
    overtime_hours:Number(row.overtime),
    last_posted_on:String(row.last_posted)
  }
}
function recordData(row){
  return {
    restraint_hours:row.restraint_hours,
    remaining_hours:row.remaining_hours,
    overtime_hours:row.overtime_hours,
    last_posted_on:row.last_posted_on,
    source_batch_id:row.source_batch_id,
    version:Number(row.version)
  }
}
async function createWorkImportPreflight({user,preflight,rows,requestId}){
  requireFullAdmin(user);
  if(!preflight?.can_commit||!Array.isArray(rows)||!rows.length)throw problem(422,'PREFLIGHT_NOT_COMMITTABLE','取込前チェックに未解決の問題があります');
  return withTransaction(async client=>{
    const employeeNos=[...new Set(rows.map(x=>String(x.employee_no||'').trim()).filter(Boolean))];
    const found=await query(`
      select id,employee_no
        from employees
       where employee_no=any($1::text[])
       order by employee_no
    `,[employeeNos],client);
    const byNo=new Map(found.rows.map(x=>[String(x.employee_no),x]));
    const missing=employeeNos.filter(no=>!byNo.has(no));
    if(missing.length)throw problem(422,'UNKNOWN_EMPLOYEE_NUMBER','社員台帳に存在しない社員番号があります（'+missing.length+'件）');

    const batch=(await query(`
      insert into work_import_batches(
        file_name,content_sha256,created_by_user_id,state,row_count,warning_count,expires_at,request_id
      ) values($1,$2,$3,'preflight',$4,$5,now()+interval '30 minutes',$6)
      returning *
    `,[
      String(preflight.file_name||'work.xlsx').slice(0,255),
      preflight.sha256,user.id,rows.length,Number(preflight.warning_count)||0,requestId
    ],client)).rows[0];

    const payload=rows.map(row=>{
      const emp=byNo.get(String(row.employee_no));
      return {
        row_no:Number(row.row),
        employee_id:emp.id,
        employee_no_snapshot:String(row.employee_no),
        month_start:monthStart(row.month),
        after_data:summaryData(row)
      }
    });
    await query(`
      insert into work_import_rows(
        batch_id,row_no,employee_id,employee_no_snapshot,month_start,after_data
      )
      select $1,x.row_no,x.employee_id::uuid,x.employee_no_snapshot,x.month_start::date,x.after_data
        from jsonb_to_recordset($2::jsonb)
          as x(row_no int,employee_id text,employee_no_snapshot text,month_start text,after_data jsonb)
    `,[batch.id,JSON.stringify(payload)],client);

    await query(`
      insert into audit_logs(actor_user_id,action,entity_type,entity_id,result,request_id,summary)
      values($1,'勤務集計取込前確認','work_import',$2,'success',$3,$4)
    `,[user.id,batch.id,requestId,'normalized rows '+rows.length+' / original file not stored'],client);
    return batch
  })
}
async function getWorkImportBatch({user,batchId}){
  requireFullAdmin(user);
  const batch=(await query('select * from work_import_batches where id=$1 limit 1',[batchId])).rows[0];
  if(!batch)throw problem(404,'WORK_IMPORT_NOT_FOUND','勤務集計取込batchが見つかりません');
  const rows=await query(`
    select row_no,employee_id,employee_no_snapshot,month_start,result,committed_version
      from work_import_rows
     where batch_id=$1
     order by row_no
     limit 200
  `,[batchId]);
  return {batch,rows:rows.rows,rows_truncated:Number(batch.row_count)>rows.rows.length}
}
async function commitWorkImport({user,batchId,expectedVersion,requestId}){
  requireFullAdmin(user);
  return withTransaction(async client=>{
    const batch=(await query('select * from work_import_batches where id=$1 for update',[batchId],client)).rows[0];
    if(!batch)throw problem(404,'WORK_IMPORT_NOT_FOUND','勤務集計取込batchが見つかりません');
    checkVersion(batch,expectedVersion);
    if(String(batch.created_by_user_id)!==String(user.id))throw problem(403,'WORK_IMPORT_OWNER_REQUIRED','取込前確認を行った管理者本人が確定してください');
    if(batch.state!=='preflight')throw problem(409,'WORK_IMPORT_STATE_INVALID','この取込batchは確定できる状態ではありません');
    if(new Date(batch.expires_at).getTime()<=Date.now())throw problem(409,'WORK_IMPORT_EXPIRED','取込前確認の有効期限が切れています。再度ファイルを確認してください');

    const rows=(await query('select * from work_import_rows where batch_id=$1 order by row_no for update',[batchId],client)).rows;
    if(rows.length!==Number(batch.row_count))throw problem(409,'WORK_IMPORT_ROW_MISMATCH','取込行数を確認できません');

    let inserted=0,updated=0;
    for(const row of rows){
      const values=row.after_data||{};
      const existing=(await query(`
        select * from work_summary_monthly
         where employee_id=$1 and month_start=$2
         for update
      `,[row.employee_id,row.month_start],client)).rows[0]||null;
      const before=existing?recordData(existing):null;
      let after;
      if(existing){
        after=(await query(`
          update work_summary_monthly
             set restraint_hours=$2,remaining_hours=$3,overtime_hours=$4,last_posted_on=$5,
                 source_batch_id=$6,updated_at=now(),version=version+1
           where id=$1
          returning *
        `,[
          existing.id,values.restraint_hours,values.remaining_hours,values.overtime_hours,
          values.last_posted_on,batchId
        ],client)).rows[0];
        updated++
      }else{
        after=(await query(`
          insert into work_summary_monthly(
            employee_id,month_start,restraint_hours,remaining_hours,overtime_hours,last_posted_on,source_batch_id
          ) values($1,$2,$3,$4,$5,$6,$7)
          returning *
        `,[
          row.employee_id,row.month_start,values.restraint_hours,values.remaining_hours,
          values.overtime_hours,values.last_posted_on,batchId
        ],client)).rows[0];
        inserted++
      }
      const afterData=recordData(after);
      await query(`
        update work_import_rows
           set before_data=$2::jsonb,committed_version=$3,result='committed',updated_at=now()
         where id=$1
      `,[row.id,before===null?null:JSON.stringify(before),after.version],client);
      await query(`
        insert into record_histories(
          entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason
        ) values('work_summary_monthly',$1,$2,$3,'work_import_commit',$4::jsonb,$5::jsonb,$6)
      `,[
        after.id,row.employee_id,user.id,before===null?null:JSON.stringify(before),
        JSON.stringify(afterData),'work import batch '+batchId
      ],client)
    }

    const next=(await query(`
      update work_import_batches
         set state='committed',committed_at=now(),updated_at=now(),version=version+1
       where id=$1
      returning *
    `,[batchId],client)).rows[0];
    await query(`
      insert into audit_logs(actor_user_id,action,entity_type,entity_id,result,request_id,summary)
      values($1,'勤務集計取込確定','work_import',$2,'success',$3,$4)
    `,[user.id,batchId,requestId,'rows '+rows.length+' / inserted '+inserted+' / updated '+updated],client);
    return {batch:next,committed_count:rows.length,inserted_count:inserted,updated_count:updated}
  })
}
async function rollbackWorkImport({user,batchId,expectedVersion,reason,requestId}){
  requireFullAdmin(user);
  const cleanReason=String(reason||'').trim().slice(0,500);
  if(!cleanReason)throw problem(422,'ROLLBACK_REASON_REQUIRED','ロールバック理由を入力してください');
  return withTransaction(async client=>{
    const batch=(await query('select * from work_import_batches where id=$1 for update',[batchId],client)).rows[0];
    if(!batch)throw problem(404,'WORK_IMPORT_NOT_FOUND','勤務集計取込batchが見つかりません');
    checkVersion(batch,expectedVersion);
    if(batch.state!=='committed')throw problem(409,'WORK_IMPORT_STATE_INVALID','確定済みの取込batchだけをロールバックできます');

    const rows=(await query('select * from work_import_rows where batch_id=$1 order by row_no for update',[batchId],client)).rows;
    for(const row of rows){
      const current=(await query(`
        select * from work_summary_monthly
         where employee_id=$1 and month_start=$2
         for update
      `,[row.employee_id,row.month_start],client)).rows[0];
      if(!current||String(current.source_batch_id)!==String(batchId)||Number(current.version)!==Number(row.committed_version)){
        throw problem(409,'ROLLBACK_CONFLICT','取込後に変更された勤務集計があります。自動ロールバックを中止しました')
      }
    }

    let restored=0,removed=0;
    for(const row of rows){
      const current=(await query(`
        select * from work_summary_monthly
         where employee_id=$1 and month_start=$2
         for update
      `,[row.employee_id,row.month_start],client)).rows[0];
      const currentData=recordData(current);
      let afterData=null;
      if(row.before_data){
        const before=row.before_data;
        const restoredRow=(await query(`
          update work_summary_monthly
             set restraint_hours=$2,remaining_hours=$3,overtime_hours=$4,last_posted_on=$5,
                 source_batch_id=$6,updated_at=now(),version=version+1
           where id=$1
          returning *
        `,[
          current.id,before.restraint_hours,before.remaining_hours,before.overtime_hours,
          before.last_posted_on,before.source_batch_id||null
        ],client)).rows[0];
        afterData=recordData(restoredRow);restored++
      }else{
        await query('delete from work_summary_monthly where id=$1',[current.id],client);
        removed++
      }
      await query(`
        update work_import_rows set result='rolled_back',updated_at=now() where id=$1
      `,[row.id],client);
      await query(`
        insert into record_histories(
          entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason
        ) values('work_summary_monthly',$1,$2,$3,'work_import_rollback',$4::jsonb,$5::jsonb,$6)
      `,[
        current.id,row.employee_id,user.id,JSON.stringify(currentData),
        afterData===null?null:JSON.stringify(afterData),cleanReason
      ],client)
    }

    const next=(await query(`
      update work_import_batches
         set state='rolled_back',rolled_back_at=now(),rollback_reason=$2,updated_at=now(),version=version+1
       where id=$1
      returning *
    `,[batchId,cleanReason],client)).rows[0];
    await query(`
      insert into audit_logs(actor_user_id,action,entity_type,entity_id,result,request_id,summary)
      values($1,'勤務集計取込ロールバック','work_import',$2,'success',$3,$4)
    `,[user.id,batchId,requestId,'rows '+rows.length+' / restored '+restored+' / removed '+removed+' / '+cleanReason],client);
    return {batch:next,rolled_back_count:rows.length,restored_count:restored,removed_count:removed}
  })
}
module.exports={createWorkImportPreflight,getWorkImportBatch,commitWorkImport,rollbackWorkImport};
