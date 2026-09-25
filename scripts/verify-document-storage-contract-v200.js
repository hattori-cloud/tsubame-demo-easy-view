'use strict';

process.env.DATABASE_URL=process.env.TEST_DATABASE_URL||process.env.DATABASE_URL;
process.env.TSUBAME_DB_SSL='disable';
process.env.VERCEL_ENV='preview';
process.env.NODE_ENV='test';
process.env.TSUBAME_SESSION_SECRET=process.env.TSUBAME_SESSION_SECRET||'fictional-ci-document-session-secret-0123456789';
process.env.TSUBAME_MFA_ENCRYPTION_KEY=process.env.TSUBAME_MFA_ENCRYPTION_KEY||Buffer.alloc(32,5).toString('base64');
process.env.TSUBAME_DOCUMENT_STORAGE_PROVIDER='ci-memory';
process.env.TSUBAME_DOCUMENT_TICKET_SECRET='fictional-ci-document-ticket-secret-0123456789';
process.env.TSUBAME_DOCUMENT_MAX_BYTES='10485760';

const db=require('../api/_lib/db');
const auth=require('../api/_lib/auth');
const authStore=require('../api/_lib/auth-store');
const storage=require('../api/_lib/document-storage');
const router=require('../api/router');

function assert(condition,message){if(!condition)throw new Error(message)}
async function call(route,method='GET',body={},cookie='',headers={}){
  const res={
    statusCode:200,headers:{},
    setHeader(k,v){this.headers[String(k).toLowerCase()]=v},
    status(n){this.statusCode=n;return this},
    json(v){this.body=v;return this},
    end(v){this.body=v;return this}
  };
  await router({url:'/api/v1'+route,method,body,headers:{cookie,...headers},query:{}},res);
  return res
}
async function sessionFor(userId,mfaVerified){
  const raw=auth.newRawToken();
  await authStore.createSession({userId,tokenHash:auth.tokenHash(raw),mfaVerified,ttlSeconds:3600});
  return auth.secureCookie(raw,3600).split(';')[0]
}

(async()=>{
  storage._test.resetCiStorage();

  const employee=(await db.query("select id,employee_no,name from employees where employee_no='CI9001'")).rows[0];
  const admin=(await db.query("select id from users where role_level='full' and state='active' order by login_id limit 1")).rows[0];
  assert(employee&&admin,'fictional employee/admin seed missing');

  await db.query(`
    insert into document_policy_rules(
      category,original_handling,security_class,access_level,verification_required,retention_years,retention_note
    ) values(
      'CI_STRICT_ORIGINAL','electronic_original','strict','full_admin',true,7,'fictional CI policy'
    )
    on conflict(category) do update set
      original_handling=excluded.original_handling,security_class=excluded.security_class,
      access_level=excluded.access_level,verification_required=excluded.verification_required
  `);

  const mfaCookie=await sessionFor(admin.id,true);
  const noMfaCookie=await sessionFor(admin.id,false);
  const bytes=Buffer.from('%PDF-1.7\nFictional CI original document\n%%EOF','utf8');

  const body={
    employee_id:employee.id,category:'CI_STRICT_ORIGINAL',name:'CI架空原本',
    original_filename:'社員名を含めない-test.pdf',content_type:'application/pdf',size_bytes:bytes.length,
    registered_on:'2099-01-15'
  };

  const denied=await call('/documents/upload-ticket','POST',body,noMfaCookie);
  assert(denied.statusCode===403,'strict original without MFA must be denied');

  const upload=await call('/documents/upload-ticket','POST',body,mfaCookie);
  assert(upload.statusCode===200,'upload ticket failed: '+JSON.stringify(upload.body));
  assert(upload.body.upload_ticket&&upload.body.upload?.token,'upload authorization missing');
  assert(!String(upload.body.upload_ticket).includes(employee.id),'encrypted upload ticket leaked employee id');
  assert(!String(upload.body.upload_ticket).includes(body.original_filename),'encrypted upload ticket leaked filename');

  const claims=storage.decryptTicket(upload.body.upload_ticket);
  assert(!String(claims.storage_key).includes(employee.employee_no),'storage key contains employee number');
  assert(!String(claims.storage_key).includes(employee.name),'storage key contains employee name');
  assert(!String(claims.storage_key).includes('test.pdf'),'storage key contains filename');

  const put=await storage._test.ciPutObject({
    uploadToken:upload.body.upload.token,body:bytes,contentType:'application/pdf'
  });
  assert(put.state==='quarantine'&&put.malware_status==='clean','clean object did not enter clean quarantine');
  assert(/^[0-9a-f]{64}$/.test(put.sha256),'SHA-256 missing');

  const finalized=await call('/documents/finalize','POST',{upload_ticket:upload.body.upload_ticket},mfaCookie);
  assert(finalized.statusCode===201,'document finalize failed: '+JSON.stringify(finalized.body));
  const doc=finalized.body.document;
  assert(doc.storage_state==='active'&&doc.malware_scan_status==='clean','finalized document not active/clean');
  assert(!Object.prototype.hasOwnProperty.call(doc,'storage_key'),'finalize response leaked storage key');
  assert(!Object.prototype.hasOwnProperty.call(doc,'content_sha256'),'finalize response leaked internal hash');

  const download=await call('/documents/'+doc.id+'/download-ticket','GET',{},mfaCookie);
  assert(download.statusCode===200,'download ticket failed: '+JSON.stringify(download.body));
  assert(/^ci-memory:\/\/download\//.test(download.body.download_url),'short-lived download URL missing');
  const downloadToken=download.body.download_url.split('/').pop();
  const downloaded=await storage._test.ciReadDownload(downloadToken);
  assert(Buffer.compare(downloaded,bytes)===0,'downloaded bytes differ from uploaded bytes');

  const blockedBytes=Buffer.from('CI-MALWARE-BLOCK fictional blocked content','utf8');
  const blockedUpload=await call('/documents/upload-ticket','POST',{
    ...body,name:'CI架空blocked原本',original_filename:'blocked.pdf',size_bytes:blockedBytes.length
  },mfaCookie);
  assert(blockedUpload.statusCode===200,'blocked-case upload ticket failed');
  const blockedPut=await storage._test.ciPutObject({
    uploadToken:blockedUpload.body.upload.token,body:blockedBytes,contentType:'application/pdf'
  });
  assert(blockedPut.malware_status==='blocked','CI blocked sample was not blocked');
  const blockedFinalize=await call('/documents/finalize','POST',{upload_ticket:blockedUpload.body.upload_ticket},mfaCookie);
  assert(blockedFinalize.statusCode===409,'malware-blocked original was finalized');
  assert(blockedFinalize.body?.error?.code==='DOCUMENT_MALWARE_NOT_CLEAN','wrong malware block error');

  const audit=(await db.query(`
    select action,count(*)::int n
      from audit_logs
     where action in ('document_upload_ticket_issued','document_upload_received','document_finalized','document_download_authorized')
     group by action
  `)).rows;
  const actions=Object.fromEntries(audit.map(x=>[x.action,Number(x.n)]));
  for(const action of ['document_upload_ticket_issued','document_upload_received','document_finalized','document_download_authorized']){
    assert(actions[action]>=1,'missing audit event '+action)
  }

  console.log(JSON.stringify({
    ok:true,
    strict_mfa_denied:true,
    encrypted_upload_ticket:true,
    opaque_storage_key:true,
    quarantine_clean:true,
    sha256_recorded:true,
    finalized_active:true,
    short_lived_download:true,
    downloaded_bytes_match:true,
    malware_blocked:true,
    audit_events:true,
    production_provider_enabled:false,
    real_employee_data_used:false
  }))
})().catch(err=>{
  console.error(err.stack||err);
  process.exitCode=1
}).finally(async()=>{await db.closePool()});
