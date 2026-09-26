-- V200 selected-user workflow permission migration
-- Keeps manager-to-manager handoffs and retires employee self-service communication permissions.
-- Safe to run on a fresh canonical schema or an older V200 selected-user schema.

begin;

do $check$
begin
  if to_regclass('public.user_feature_permissions') is null then
    raise exception 'user_feature_permissions is required before selected-user workflow migration';
  end if;
end
$check$;

alter table public.user_feature_permissions
  drop constraint if exists user_feature_permissions_feature_check;

insert into public.user_feature_permissions(user_id,feature,access_level)
select user_id,'handoffs',access_level
  from public.user_feature_permissions
 where feature='notices_workflow'
on conflict (user_id,feature) do update
set access_level=case
  when public.user_feature_permissions.access_level='edit' or excluded.access_level='edit' then 'edit'
  else 'view'
end;

delete from public.user_feature_permissions where feature='notices_workflow';

alter table public.user_feature_permissions
  add constraint user_feature_permissions_feature_check check (feature in (
    'employees','deadlines','accidents','complaints','near_misses','credentials_documents',
    'vehicles','safety_analysis','work_import','assets_training','handoffs',
    'audit_logs','user_admin'
  ));

commit;
