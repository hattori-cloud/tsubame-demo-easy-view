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
function tableConfig(kind){
  const map={
    training:{table:'safety_training',required:['course'],allowed:['course','due','status','completed_at'],label:'研修'},
    asset:{table:'assets',required:['item','asset_no'],allowed:['item','asset_no','return_due','status','returned_at'],label:'貸与品'},
    guidance:{table:'guidance_records',required:['guidance_on','type','summary','owner'],allowed:['guidance_on','type','summary','owner','next_review'],label:'安全指導'}
  };
  const cfg=map[kind];if(!cfg)throw problem(422,'INVALID_SUPPORT_KIND','対象区分を確認してください');return cfg
}
async function listSupport(user,kind,filters={}){
  if(kind==='guidance')manager(user);
  const cfg=tableConfig(kind),params=[],scope=scopeSql(user,params,'e'),where=[scope];
  if(filters.employee_id){params.push(String(filters.employee_id));where.push(`r.employee_id=$${params.length}`)}
  if(filters.status&&kind!=='guidance'){params.push(String(filters.status));where.push(`r.status=$${params.length}`)}
  const q=String(filters.q||'').trim();if(q){params.push('%'+q+'%');const p=params.length;const cols=kind==='training'?["r.course"]:kind==='asset'?["r.item","r.asset_no"]:["r.type","r.summary","r.owner"];where.push('('+cols.map(c=>c+' ilike $'+p).concat(['e.name ilike $'+p,'e.employee_no ilike $'+p]).join(' or ')+')')}
  const page=Math.max(1,Number.parseInt(filters.page,10)||1),pageSize=Math.min(100,Math.max(1,Number.parseInt(filters.page_size,10)||50)),offset=(page-1)*pageSize;
  params.push(pageSize,offset);
  const order=kind==='guidance'?'r.guidance_on desc,r.id desc':kind==='training'?'r.due nulls last,r.id':'r.return_due nulls last,r.id';
  const r=await query(`select r.*,e.employee_no,e.name as employee_name,count(*) over()::int as _total from ${cfg.table} r join employees e on e.id=r.employee_id where ${where.join(' and ')} order by ${order} limit $${params.length-1} offset $${params.length}`,params);
  const total=r.rows[0]?Number(r.rows[0]._total):0;return {items:r.rows.map(({_total,...x})=>x),page,page_size:pageSize,total}
}
async function createSupport({user,kind,body,requestId}){
  manager(user);const cfg=tableConfig(kind);
  return withTransaction(async client=>{
    const employee=await employeeForUser(user,String(body.employee_id||''),client);
    for(const key of cfg.required)if(!String(body[key]??'').trim())throw problem(422,'REQUIRED_FIELDS',cfg.label+'の必須項目を入力してください');
    let sql,values;
    if(kind==='training'){sql=`insert into safety_training(employee_id,course,due,status,completed_at) values($1,$2,$3,$4,$5) returning *`;values=[employee.id,String(body.course).trim(),body.due||null,body.status||'open',body.completed_at||null]}
    else if(kind==='asset'){sql=`insert into assets(employee_id,item,asset_no,return_due,status,returned_at) values($1,$2,$3,$4,$5,$6) returning *`;values=[employee.id,String(body.item).trim(),String(body.asset_no).trim(),body.return_due||null,body.status||'loaned',body.returned_at||null]}
    else {sql=`insert into guidance_records(employee_id,guidance_on,type,summary,owner,next_review) values($1,$2,$3,$4,$5,$6) returning *`;values=[employee.id,body.guidance_on,String(body.type).trim(),String(body.summary).trim(),String(body.owner).trim(),body.next_review||null]}
    const row=(await query(sql,values,client)).rows[0];
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,$2,$3,$4,$5,'success',$6,$7)`,[user.id,cfg.label+'登録',kind,row.id,employee.id,requestId,cfg.label],client);
    return row
  })
}
async function updateSupport({user,kind,id,body,expectedVersion,requestId}){
  manager(user);const cfg=tableConfig(kind);
  return withTransaction(async client=>{
    const params=[id],scope=scopeSql(user,params,'e');
    const before=(await query(`select r.* from ${cfg.table} r join employees e on e.id=r.employee_id where r.id=$1 and ${scope} for update`,params,client)).rows[0];
    if(!before)throw problem(404,'NOT_FOUND','対象データが見つかりません');assertVersion(before,expectedVersion);
    if(Object.prototype.hasOwnProperty.call(body||{},'employee_id'))throw problem(422,'EMPLOYEE_REASSIGN_NOT_ALLOWED','登録後に別の社員へ付け替えることはできません');
    const patch={};for(const k of cfg.allowed)if(Object.prototype.hasOwnProperty.call(body||{},k))patch[k]=body[k]===undefined?null:body[k];
    for(const key of cfg.required)if(key in patch&&!String(patch[key]??'').trim())throw problem(422,'REQUIRED_FIELDS',cfg.label+'の必須項目を入力してください');
    const changed=Object.entries(patch).filter(([k,v])=>String(before[k]??'')!==String(v??''));if(!changed.length)return before;
    const vals=[id],sets=changed.map(([k,v])=>{vals.push(v);return `${k}=$${vals.length}`});
    const after=(await query(`update ${cfg.table} set ${sets.join(',')},updated_at=now(),version=version+1 where id=$1 returning *`,vals,client)).rows[0];
    await query(`insert into record_histories(entity_type,entity_id,employee_id,actor_user_id,action,before_data,after_data,reason) values($1,$2,$3,$4,'update',$5::jsonb,$6::jsonb,$7)`,[kind,id,before.employee_id,user.id,JSON.stringify(Object.fromEntries(changed.map(([k])=>[k,before[k]]))),JSON.stringify(Object.fromEntries(changed)),cfg.label+'更新'],client);
    await query(`insert into audit_logs(actor_user_id,action,entity_type,entity_id,employee_id,result,request_id,summary) values($1,$2,$3,$4,$5,'success',$6,$7)`,[user.id,cfg.label+'更新',kind,id,before.employee_id,requestId,changed.map(([k])=>k).join(',')],client);
    return after
  })
}
module.exports={listSupport,createSupport,updateSupport,tableConfig};
