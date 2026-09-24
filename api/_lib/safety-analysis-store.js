const {query}=require('./db');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}
function requireAnalysisManager(user){if(!user||!['full','scoped'].includes(user.role_level))throw problem(403,'MANAGER_REQUIRED','分析センターは管理者のみ利用できます');return user}
function snapshotScopeSql(user,params,officeExpr,departmentExpr){
  if(user.role_level==='full')return 'true';
  const scopes=user.scopes||[];if(!scopes.length)return 'false';
  return '('+scopes.map(s=>{params.push(s.office,s.department);return `(${officeExpr}=$${params.length-1} and ${departmentExpr}=$${params.length})`}).join(' or ')+')'
}
function addPeriod(where,params,expr,filters){
  if(filters.from){params.push(String(filters.from));where.push(`${expr}>=$${params.length}::date`)}else where.push(`${expr}>=date_trunc('month',current_date)::date-interval '11 months'`);
  if(filters.to){params.push(String(filters.to));where.push(`${expr}<=$${params.length}::date`)}else where.push(`${expr}<=current_date`)
}
function addSnapshotFilters(where,params,officeExpr,departmentExpr,filters){
  if(filters.office){params.push(String(filters.office));where.push(`${officeExpr}=$${params.length}`)}
  if(filters.department){params.push(String(filters.department));where.push(`${departmentExpr}=$${params.length}`)}
}
async function accidentSummary(user,filters){
  const p=[],w=[snapshotScopeSql(user,p,'a.office_at_record','a.department_at_record'),'a.archived_at is null'];addPeriod(w,p,'a.occurred_on',filters);addSnapshotFilters(w,p,'a.office_at_record','a.department_at_record',filters);
  const r=await query(`select count(*)::int total,count(*) filter(where phase<>'completed')::int open_count,coalesce(avg(coalesce(company_repair_cost,0)+coalesce(opponent_repair_cost,0)),0)::numeric(12,1) avg_repair_cost,count(*) filter(where nullif(trim(coalesce(cause,'')),'') is not null and nullif(trim(coalesce(prevention,'')),'') is not null and nullif(trim(coalesce(response_history,'')),'') is not null)::int analysis_complete_count,count(*) filter(where nullif(trim(coalesce(office_at_record,'')),'') is not null and nullif(trim(coalesce(department_at_record,'')),'') is not null and nullif(trim(coalesce(employment_at_record,'')),'') is not null)::int snapshot_complete_count from accidents a where ${w.join(' and ')}`,p);return r.rows[0]
}
async function nearSummary(user,filters){
  const p=[],w=[snapshotScopeSql(user,p,'n.office_at_report','n.department_at_report'),'n.archived_at is null'];addPeriod(w,p,'n.occurred_on',filters);addSnapshotFilters(w,p,'n.office_at_report','n.department_at_report',filters);
  const r=await query(`select count(*)::int total,count(*) filter(where lower(coalesce(risk_level,'')) in ('high','critical') or risk_level in ('高','重大'))::int high_risk_count,count(*) filter(where nullif(trim(coalesce(prevention,'')),'') is not null and nullif(trim(coalesce(risk_level,'')),'') is not null and nullif(trim(coalesce(cause_side,'')),'') is not null)::int analysis_complete_count,count(*) filter(where nullif(trim(coalesce(office_at_report,'')),'') is not null and nullif(trim(coalesce(department_at_report,'')),'') is not null and nullif(trim(coalesce(employment_at_report,'')),'') is not null)::int snapshot_complete_count from near_misses n where ${w.join(' and ')}`,p);return r.rows[0]
}
async function complaintSummary(user,filters){
  const p=[],w=[snapshotScopeSql(user,p,'c.office_at_record','c.department_at_record'),'c.archived_at is null'];addPeriod(w,p,'coalesce(c.occurrence_date,c.responded_on)',filters);addSnapshotFilters(w,p,'c.office_at_record','c.department_at_record',filters);
  const r=await query(`select count(*)::int total,count(*) filter(where status<>'completed')::int open_count,count(*) filter(where nullif(trim(coalesce(guidance_content,'')),'') is not null and nullif(trim(coalesce(summary,'')),'') is not null)::int analysis_complete_count,count(*) filter(where nullif(trim(coalesce(office_at_record,'')),'') is not null and nullif(trim(coalesce(department_at_record,'')),'') is not null and nullif(trim(coalesce(employment_at_record,'')),'') is not null)::int snapshot_complete_count from complaints c where ${w.join(' and ')}`,p);return r.rows[0]
}
async function monthlyTrend(user,filters){
  const defs=[['accident','accidents','a','occurred_on','office_at_record','department_at_record'],['near_miss','near_misses','n','occurred_on','office_at_report','department_at_report'],['complaint','complaints','c','coalesce(occurrence_date,responded_on)','office_at_record','department_at_record']];
  const all=await Promise.all(defs.map(async d=>{const [type,table,a,date,office,dept]=d,p=[],w=[snapshotScopeSql(user,p,`${a}.${office}`,`${a}.${dept}`),`${a}.archived_at is null`];addPeriod(w,p,date.includes('(')?date:`${a}.${date}`,filters);addSnapshotFilters(w,p,`${a}.${office}`,`${a}.${dept}`,filters);const dateExpr=date.includes('(')?date.replaceAll('occurrence_date',`${a}.occurrence_date`).replaceAll('responded_on',`${a}.responded_on`):`${a}.${date}`;const r=await query(`select to_char(date_trunc('month',${dateExpr}),'YYYY-MM') month,count(*)::int count from ${table} ${a} where ${w.join(' and ')} group by 1 order by 1`,p);return {type,rows:r.rows}}));
  const m=new Map();for(const d of all)for(const r of d.rows){if(!m.has(r.month))m.set(r.month,{month:r.month,accident:0,near_miss:0,complaint:0});m.get(r.month)[d.type]=Number(r.count)}return [...m.values()].sort((a,b)=>a.month.localeCompare(b.month))
}
async function departmentComparison(user,filters){
  const p=[],scope=snapshotScopeSql(user,p,'x.office_snapshot','x.department_snapshot'),w=[scope];if(filters.office){p.push(String(filters.office));w.push(`x.office_snapshot=$${p.length}`)}if(filters.department){p.push(String(filters.department));w.push(`x.department_snapshot=$${p.length}`)}p.push(filters.from?String(filters.from):null,filters.to?String(filters.to):null);const fp=p.length-1,tp=p.length;
  const sql=`with events as (select office_at_record office_snapshot,department_at_record department_snapshot,occurred_on event_date,'accident' type from accidents where archived_at is null union all select office_at_report,department_at_report,occurred_on,'near_miss' from near_misses where archived_at is null union all select office_at_record,department_at_record,coalesce(occurrence_date,responded_on),'complaint' from complaints where archived_at is null),x as (select * from events where event_date>=coalesce($${fp}::date,date_trunc('month',current_date)::date-interval '11 months') and event_date<=coalesce($${tp}::date,current_date)),ec as (select office_snapshot,department_snapshot,count(*)::int event_count,count(*) filter(where type='accident')::int accident_count,count(*) filter(where type='near_miss')::int near_miss_count,count(*) filter(where type='complaint')::int complaint_count from x where ${w.join(' and ')} group by office_snapshot,department_snapshot),heads as (select office,department,count(*)::int active_employee_count from employees where lifecycle_status='active' and archived_at is null group by office,department) select ec.*,coalesce(heads.active_employee_count,0) active_employee_count,case when coalesce(heads.active_employee_count,0)>0 then round(ec.event_count*100.0/heads.active_employee_count,1) else null end reference_per_100 from ec left join heads on heads.office=ec.office_snapshot and heads.department=ec.department_snapshot order by ec.event_count desc,ec.office_snapshot,ec.department_snapshot`;
  return (await query(sql,p)).rows
}
async function safetySummary(user,filters={}){
  requireAnalysisManager(user);
  const [a,n,c,trend,departments]=await Promise.all([accidentSummary(user,filters),nearSummary(user,filters),complaintSummary(user,filters),monthlyTrend(user,filters),departmentComparison(user,filters)]);
  const at=Number(a.total||0),nt=Number(n.total||0),ct=Number(c.total||0),total=at+nt+ct,analysisComplete=Number(a.analysis_complete_count||0)+Number(n.analysis_complete_count||0)+Number(c.analysis_complete_count||0),snapshotComplete=Number(a.snapshot_complete_count||0)+Number(n.snapshot_complete_count||0)+Number(c.snapshot_complete_count||0),open=Number(a.open_count||0)+Number(c.open_count||0);
  return {filters:{from:filters.from||null,to:filters.to||null,office:filters.office||null,department:filters.department||null},totals:{all:total,accidents:at,near_misses:nt,complaints:ct},kpis:{high_risk_near_miss_ratio:nt?Number(n.high_risk_count||0)*100/nt:0,open_case_ratio:(at+ct)?open*100/(at+ct):0,average_repair_cost:Number(a.avg_repair_cost||0),analysis_completeness_ratio:total?analysisComplete*100/total:0,snapshot_completeness_ratio:total?snapshotComplete*100/total:0},trend,departments,notes:{reference_per_100:'現在の在籍人数を分母にした参考比であり、真の発生率ではありません。'}}
}
module.exports={safetySummary,accidentSummary,nearSummary,complaintSummary,monthlyTrend,departmentComparison,snapshotScopeSql};
