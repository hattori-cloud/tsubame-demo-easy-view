const {query}=require('./db');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function requireAuditAdmin(user,identity){
  if(!user||user.role_level!=='full'||!identity?.mfa)throw problem(403,'FULL_ADMIN_MFA_REQUIRED','監査ログは全社管理者のMFA確認済みセッションのみ閲覧できます')
}
async function listAuditLogs(user,identity,filters={}){
  requireAuditAdmin(user,identity);
  const params=[],where=['true'];
  for(const [key,column] of [['actor_user_id','a.actor_user_id'],['employee_id','a.employee_id'],['entity_type','a.entity_type'],['entity_id','a.entity_id'],['result','a.result']]){
    const v=String(filters[key]||'').trim();if(v){params.push(v);where.push(column+'=$'+params.length)}
  }
  if(filters.from){params.push(String(filters.from));where.push('a.occurred_at>=$'+params.length+'::timestamptz')}
  if(filters.to){params.push(String(filters.to));where.push('a.occurred_at<=$'+params.length+'::timestamptz')}
  const q=String(filters.q||'').trim();if(q){params.push('%'+q+'%');where.push('(a.action ilike $'+params.length+' or a.summary ilike $'+params.length+' or a.request_id ilike $'+params.length+')')}
  const page=Math.max(1,Number.parseInt(filters.page,10)||1),pageSize=Math.min(100,Math.max(1,Number.parseInt(filters.page_size,10)||50)),offset=(page-1)*pageSize;
  params.push(pageSize,offset);
  const r=await query(`
    select a.id,a.occurred_at,a.actor_user_id,a.action,a.entity_type,a.entity_id,a.employee_id,a.result,a.request_id,a.summary,
           u.display_name as actor_name,e.employee_no,e.name as employee_name,count(*) over()::int as _total
      from audit_logs a
 left join users u on u.id=a.actor_user_id
 left join employees e on e.id=a.employee_id
     where ${where.join(' and ')}
  order by a.occurred_at desc,a.id desc
     limit $${params.length-1} offset $${params.length}
  `,params);
  const total=r.rows[0]?Number(r.rows[0]._total):0;
  return {items:r.rows.map(({_total,...x})=>x),page,page_size:pageSize,total}
}
module.exports={listAuditLogs,requireAuditAdmin};
