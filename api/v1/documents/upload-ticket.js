const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {documentStorageAdapterReady}=require('../../_lib/runtime-config');
const {query}=require('../../_lib/db');
const {employeeForUser,policyForCategory,requireDocumentPrivilege}=require('../../_lib/credential-store');
const {validateUploadSpec,randomQuarantinePath,issuePrivateUpload}=require('../../_lib/document-storage');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function displayFileName(v){return String(v||'').replace(/[\x00-\x1f\x7f]/g,'').replace(/[\\/]+/g,'_').trim().slice(0,180)||null}

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  let ticketId=null;
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    if(!['full','scoped'].includes(user.role_level))throw problem(403,'MANAGER_REQUIRED','書類原本登録は管理者のみ利用できます');
    if(!documentStorageAdapterReady())throw problem(503,'DOCUMENT_STORAGE_ADAPTER_NOT_READY','private原本ストレージが未接続です');
    const employee=await employeeForUser(user,String(req.body?.employee_id||''));
    const category=String(req.body?.category||'').trim(),name=String(req.body?.name||'').trim();
    if(!category||!name)throw problem(422,'REQUIRED_FIELDS','書類区分・書類名を入力してください');
    const policy=await policyForCategory(category);requireDocumentPrivilege(user,identity,policy);
    if(!['electronic_original','paper_and_electronic'].includes(policy.original_handling))throw problem(422,'ELECTRONIC_ORIGINAL_NOT_ALLOWED','この書類区分は電子原本登録の対象ではありません');
    const qualificationId=req.body?.qualification_id?String(req.body.qualification_id):null;
    if(qualificationId){
      const linked=(await query('select id from qualifications where id=$1 and employee_id=$2 and archived_at is null limit 1',[qualificationId,employee.id])).rows[0];
      if(!linked)throw problem(422,'QUALIFICATION_EMPLOYEE_MISMATCH','選択した資格は対象社員の有効な資格ではありません')
    }
    const spec=validateUploadSpec({contentType:req.body?.content_type,size:req.body?.size_bytes});
    const clientSha=String(req.body?.sha256||'').trim().toLowerCase()||null;
    if(clientSha&&!/^[0-9a-f]{64}$/.test(clientSha))throw problem(422,'INVALID_SHA256','SHA-256を確認してください');
    const pathname=randomQuarantinePath(spec.contentType);
    const signed=await issuePrivateUpload({pathname,contentType:spec.contentType,size:spec.size});
    const registeredOn=String(req.body?.registered_on||new Date().toISOString().slice(0,10));
    const row=(await query(`
      insert into document_upload_tickets(
        employee_id,qualification_id,category,name,kind,registered_on,expiry,expected_content_type,expected_size_bytes,client_sha256,storage_key,original_file_name,actor_user_id,security_class,access_level,original_handling,verification_required,expires_at
      ) values($1,$2,$3,$4,$5,$6::date,$7::date,$8,$9,$10,$11,$12,$13,$14,$15,$16,$17,$18::timestamptz) returning id
    `,[employee.id,qualificationId,category,name,req.body?.kind||null,registeredOn,req.body?.expiry||null,spec.contentType,spec.size,clientSha,pathname,displayFileName(req.body?.original_file_name),user.id,policy.security_class,policy.access_level,policy.original_handling,policy.verification_required,signed.expires_at])).rows[0];
    ticketId=row.id;
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,'原本アップロード認可','document_upload_ticket',$2,$3,'success',$4,$5)`,[user.id,row.id,employee.id,rid,category+' / '+spec.contentType+' / '+spec.size+' bytes']);
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('Cache-Control','no-store');
    return res.status(201).json({ticket_id:row.id,upload:{method:'PUT',url:signed.url,expires_at:signed.expires_at,content_type:spec.contentType,size_bytes:spec.size},state:'quarantine'})
  }catch(err){
    if(ticketId)try{await query("update document_upload_tickets set state='cancelled',updated_at=now() where id=$1 and state='issued'",[ticketId])}catch(_){}
    return sendApiError(req,res,err)
  }
};
