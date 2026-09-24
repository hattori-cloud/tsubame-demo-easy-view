const {query}=require('./db');
const {scopeSql}=require('./employee-store');
const {vehicleScopeSql}=require('./vehicle-store');
const {documentVisibilitySql}=require('./credential-store');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function dueWindow(filter){
  if(filter==='over')return {min:null,max:'-1'};
  if(filter==='today')return {min:'0',max:'0'};
  if(filter==='within30'||filter==='action')return {min:filter==='action'?null:'0',max:'30'};
  if(filter==='60')return {min:'31',max:'60'};
  return {min:null,max:'60'}
}
function dueClause(alias,params,filter){
  const w=dueWindow(filter);
  const clauses=[`${alias} is not null`];
  if(w.min!==null){params.push(Number(w.min));clauses.push(`${alias}>=current_date+$${params.length}::int`)}
  if(w.max!==null){params.push(Number(w.max));clauses.push(`${alias}<=current_date+$${params.length}::int`)}
  if(filter==='over')clauses.push(`${alias}<current_date`);
  return clauses.join(' and ')
}
function searchClause(params,q,columns){
  const value=String(q||'').trim();
  if(!value)return 'true';
  params.push('%'+value+'%');const p=params.length;
  return '('+columns.map(c=>`coalesce(${c}::text,'') ilike $${p}`).join(' or ')+')'
}
async function listDeadlines(user,identity,filters={}){
  if(!user)throw problem(403,'USER_REQUIRED','利用者を確認できません');
  const filter=String(filters.filter||'action');
  const rows=[];

  async function employeeDate(kind,label,column,action){
    const params=[],scope=scopeSql(user,params,'e'),due=dueClause('e.'+column,params,filter),search=searchClause(params,filters.q,['e.employee_no','e.name','e.office','e.department']);
    const r=await query(`select '${kind}' as type,e.id::text as source_id,e.id as employee_id,e.employee_no,e.name as employee_name,e.office,e.department,'${label}' as label,e.${column} as due,(e.${column}-current_date)::int as days_remaining,null::text as status,'${action}' as action from employees e where ${scope} and e.archived_at is null and ${due} and ${search}`,params);
    rows.push(...r.rows)
  }
  await employeeDate('license','免許期限','license_expiry','社員詳細で免許期限を更新');
  await employeeDate('health','健康診断','health_check_due','社員詳細で健康診断期限を更新');
  await employeeDate('aptitude','適性診断','aptitude_due','社員詳細で適性診断期限を更新');

  {
    const params=[],scope=scopeSql(user,params,'e'),due=dueClause('q.expiry',params,filter),search=searchClause(params,filters.q,['e.employee_no','e.name','q.name','q.certificate_no']);
    const r=await query(`select 'qualification' as type,q.id::text as source_id,q.employee_id,e.employee_no,e.name as employee_name,e.office,e.department,q.name as label,q.expiry as due,(q.expiry-current_date)::int as days_remaining,q.status,'資格を更新' as action from qualifications q join employees e on e.id=q.employee_id where q.archived_at is null and ${scope} and ${due} and ${search}`,params);rows.push(...r.rows)
  }
  {
    const params=[],visible=documentVisibilitySql(user,identity,params,'d'),due=dueClause('d.expiry',params,filter),search=searchClause(params,filters.q,['e.employee_no','e.name','d.name','d.category']);
    const r=await query(`select 'document' as type,d.id::text as source_id,d.employee_id,e.employee_no,e.name as employee_name,e.office,e.department,d.name as label,d.expiry as due,(d.expiry-current_date)::int as days_remaining,d.status,'書類を確認・更新' as action from documents d join employees e on e.id=d.employee_id where d.archived_at is null and ${visible} and ${due} and ${search}`,params);rows.push(...r.rows)
  }
  {
    const params=[],scope=scopeSql(user,params,'e'),due=dueClause('t.due',params,filter),search=searchClause(params,filters.q,['e.employee_no','e.name','t.course']);
    const r=await query(`select 'training' as type,t.id::text as source_id,t.employee_id,e.employee_no,e.name as employee_name,e.office,e.department,t.course as label,t.due,(t.due-current_date)::int as days_remaining,t.status,'研修を確認・更新' as action from safety_training t join employees e on e.id=t.employee_id where t.status<>'completed' and ${scope} and ${due} and ${search}`,params);rows.push(...r.rows)
  }
  {
    const params=[],scope=scopeSql(user,params,'e'),due=dueClause('a.return_due',params,filter),search=searchClause(params,filters.q,['e.employee_no','e.name','a.item','a.asset_no']);
    const r=await query(`select 'asset' as type,a.id::text as source_id,a.employee_id,e.employee_no,e.name as employee_name,e.office,e.department,a.item as label,a.return_due as due,(a.return_due-current_date)::int as days_remaining,a.status,'貸与品を確認・返却更新' as action from assets a join employees e on e.id=a.employee_id where a.status<>'returned' and ${scope} and ${due} and ${search}`,params);rows.push(...r.rows)
  }
  async function vehicleDue(type,label,column,action){
    const params=[],scope=vehicleScopeSql(user,params,'v'),due=dueClause('v.'+column,params,filter),search=searchClause(params,filters.q,['v.car_no','v.model','v.service']);
    const r=await query(`select '${type}' as type,v.id::text as source_id,v.primary_employee_id as employee_id,e.employee_no,e.name as employee_name,e.office,e.department,('${label} '||v.car_no||'号車') as label,v.${column} as due,(v.${column}-current_date)::int as days_remaining,v.status,'${action}' as action from vehicles v left join employees e on e.id=v.primary_employee_id where v.archived_at is null and ${scope} and ${due} and ${search}`,params);rows.push(...r.rows)
  }
  await vehicleDue('vehicle_inspection','車検','inspection_due','車両で車検期限を更新');
  await vehicleDue('vehicle_maintenance','整備','next_maintenance_due','車両で整備予定を更新');

  const normalized=rows.map(x=>{
    const days=Number(x.days_remaining);
    return {...x,days_remaining:days,due_state:days<0?'overdue':days===0?'today':days<=7?'within7':days<=30?'within30':'within60'}
  }).sort((a,b)=>a.days_remaining-b.days_remaining||String(a.employee_no||'').localeCompare(String(b.employee_no||''),'ja',{numeric:true})||String(a.label).localeCompare(String(b.label),'ja'));

  const page=Math.max(1,Number.parseInt(filters.page,10)||1),pageSize=Math.min(100,Math.max(1,Number.parseInt(filters.page_size,10)||50)),start=(page-1)*pageSize;
  return {
    summary:{
      total:normalized.length,
      overdue:normalized.filter(x=>x.days_remaining<0).length,
      today:normalized.filter(x=>x.days_remaining===0).length,
      within7:normalized.filter(x=>x.days_remaining>0&&x.days_remaining<=7).length,
      within30:normalized.filter(x=>x.days_remaining>7&&x.days_remaining<=30).length,
      within60:normalized.filter(x=>x.days_remaining>30&&x.days_remaining<=60).length
    },
    items:normalized.slice(start,start+pageSize),page,page_size:pageSize,total:normalized.length,filter
  }
}
module.exports={listDeadlines,dueWindow,dueClause,searchClause};
