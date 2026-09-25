const {query}=require('./db');

function problem(status,code,message){const e=new Error(message);e.status=status;e.code=code;return e}

async function lockFullAdminContinuity(client){
  await query("select pg_advisory_xact_lock(hashtext('tsubame_full_admin_continuity_v200'))",[],client)
}

async function requireOtherActiveFullAdmin(excludedUserIds,client){
  const ids=(Array.isArray(excludedUserIds)?excludedUserIds:[excludedUserIds]).map(String).filter(Boolean);
  if(!ids.length)return;
  const r=await query(`
    select u.id
      from users u
      join employees e on e.id=u.employee_id
     where u.role_level='full'
       and u.state='active'
       and e.lifecycle_status<>'retired'
       and not (u.id=any($1::uuid[]))
     limit 1
  `,[ids],client);
  if(!r.rows[0])throw problem(409,'LAST_FULL_ADMIN_REQUIRED','有効な全社管理者を最低1人残してください。先に別の全社管理者を用意してください')
}

module.exports={lockFullAdminContinuity,requireOtherActiveFullAdmin};
