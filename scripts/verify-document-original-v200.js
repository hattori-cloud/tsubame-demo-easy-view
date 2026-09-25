'use strict';

process.env.DATABASE_URL=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
process.env.TSUBAME_DB_SSL='disable';

const assert=require('node:assert/strict');
const db=require('../api/_lib/db');
const original=require('../api/_lib/document-original-store');

(async()=>{
  const employee=(await db.query("insert into employees(employee_no,name,office,department,lifecycle_status) values('CIDOC1','架空原本試験','本社','タクシー課','active') returning id")).rows[0];
  const user=(await db.query("insert into users(employee_id,login_id,password_hash,display_name,role_level,state,mfa_required,mfa_enrolled_at) values($1,'ci-doc-admin','ci-hash','架空原本管理者','full','active',true,now()) returning id,role_level",[employee.id])).rows[0];
  const identity={user_id:user.id,mfa:true};
  const category='CI_ORIGINAL_'+String(Date.now());

  await db.query("insert into document_policy_rules(category,original_handling,security_class,access_level,verification_required,retention_years,retention_note,updated_by_user_id) values($1,'electronic_original','restricted','scope_admin',true,7,'CI架空原本試験',$2)",[category,user.id]);

  const makeTicket=async(storageKey,suffix)=>(
    await db.query(`
      insert into document_upload_tickets(
        employee_id,category,name,registered_on,expected_content_type,expected_size_bytes,client_sha256,
        storage_key,original_file_name,actor_user_id,security_class,access_level,original_handling,
        verification_required,state,expires_at
      ) values($1,$2,$3,current_date,'application/pdf',1024,$4,$5,$6,$7,'restricted','scope_admin','electronic_original',true,'issued',now()+interval '5 minutes')
      returning *
    `,[employee.id,category,'架空原本'+suffix,'a'.repeat(64),storageKey,'fictional-'+suffix+'.pdf',user.id])
  ).rows[0];

  const t1=await makeTicket('quarantine/ci/'+Date.now()+'-1.pdf','A');
  const scan={verdict:'clean',sha256:'a'.repeat(64),content_type:'application/pdf',size_bytes:1024,engine:'CI scanner',signature:'none'};
  const doc=await original.finalizeCleanOriginal({user,identity,ticketId:t1.id,scan,requestId:'ci-doc-clean'});
  assert.equal(doc.employee_id,employee.id);
  assert.equal(doc.status,'pending');
  assert.equal(doc.storage_state,'active');
  assert.equal(doc.malware_scan_status,'clean');
  assert.equal(doc.content_sha256,'a'.repeat(64));

  const finalized=(await db.query('select state,finalized_document_id from document_upload_tickets where id=$1',[t1.id])).rows[0];
  assert.equal(finalized.state,'finalized');
  assert.equal(String(finalized.finalized_document_id),String(doc.id));

  await assert.rejects(
    ()=>original.finalizeCleanOriginal({user,identity,ticketId:t1.id,scan,requestId:'ci-doc-replay'}),
    e=>e?.code==='UPLOAD_TICKET_CONSUMED'
  );

  const t2=await makeTicket('quarantine/ci/'+Date.now()+'-2.pdf','B');
  const blocked={verdict:'blocked',sha256:'b'.repeat(64),content_type:'application/pdf',size_bytes:1024,engine:'CI scanner',signature:'EICAR-test'};
  const cancelled=await original.blockUploadTicket({user,ticketId:t2.id,employeeId:employee.id,requestId:'ci-doc-blocked',scan:blocked});
  assert.equal(cancelled.cancelled,true);
  assert.equal((await db.query('select state from document_upload_tickets where id=$1',[t2.id])).rows[0].state,'cancelled');

  const t3=await makeTicket('quarantine/ci/'+Date.now()+'-3.pdf','C');
  await db.query("update document_policy_rules set access_level='full_admin',security_class='strict',updated_at=now(),version=version+1 where category=$1",[category]);
  await assert.rejects(
    ()=>original.finalizeCleanOriginal({user,identity,ticketId:t3.id,scan,requestId:'ci-doc-policy-change'}),
    e=>e?.code==='DOCUMENT_POLICY_CHANGED'
  );

  const audits=(await db.query("select action,result from audit_logs where entity_type in ('document','document_upload_ticket') and actor_user_id=$1",[user.id])).rows;
  assert.ok(audits.some(x=>x.action==='原本確定'&&x.result==='success'));
  assert.ok(audits.some(x=>x.action==='原本malware検査'&&x.result==='denied'));

  console.log(JSON.stringify({
    ok:true,
    clean_finalized:true,
    duplicate_finalize_rejected:true,
    blocked_ticket_cancelled:true,
    stale_policy_ticket_rejected:true,
    document_status:'pending',
    storage_state:'active',
    malware_scan_status:'clean',
    real_employee_data_used:false
  }))
})().catch(err=>{console.error(err.stack||err);process.exit(1)}).finally(async()=>{await db.closePool()});
