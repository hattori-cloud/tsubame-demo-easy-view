-- V200 selected-user account retirement migration
-- Preserve historical user IDs while removing legacy general-employee/self access.
-- Existing self accounts become suspended scoped accounts with no scopes or feature permissions.

begin;

do $check$
begin
  if to_regclass('public.users') is null then raise exception 'users is required'; end if;
  if to_regclass('public.auth_sessions') is null then raise exception 'auth_sessions is required'; end if;
  if to_regclass('public.user_scopes') is null then raise exception 'user_scopes is required'; end if;
  if to_regclass('public.user_feature_permissions') is null then raise exception 'user_feature_permissions is required'; end if;
  if to_regclass('public.audit_logs') is null then raise exception 'audit_logs is required'; end if;
end
$check$;

create temporary table retired_self_users on commit drop as
select id,employee_id
  from public.users
 where role_level='self';

update public.auth_sessions
   set revoked_at=coalesce(revoked_at,now()),
       revoke_reason=coalesce(revoke_reason,'legacy_self_role_retired')
 where revoked_at is null
   and user_id in (select id from retired_self_users);

delete from public.user_scopes
 where user_id in (select id from retired_self_users);

delete from public.user_feature_permissions
 where user_id in (select id from retired_self_users);

insert into public.audit_logs(
  actor_user_id,action,entity_type,entity_id,employee_id,result,summary
)
select null,
       '旧self利用者停止',
       'user',
       id::text,
       employee_id,
       'success',
       'selected-user migration: self -> suspended scoped; scopes and feature permissions cleared'
  from retired_self_users;

update public.users
   set role_level='scoped',
       state='suspended',
       mfa_required=true,
       updated_at=now(),
       version=version+1
 where id in (select id from retired_self_users);

-- All designated users require MFA in the selected-user model.
update public.users
   set mfa_required=true,
       updated_at=now(),
       version=version+1
 where role_level in ('full','scoped')
   and mfa_required=false;

alter table public.users
  drop constraint if exists users_selected_role_check;
alter table public.users
  add constraint users_selected_role_check
  check (role_level in ('full','scoped'));

alter table public.users
  drop constraint if exists users_selected_mfa_check;
alter table public.users
  add constraint users_selected_mfa_check
  check (mfa_required=true);

commit;
