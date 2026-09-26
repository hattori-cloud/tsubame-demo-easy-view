-- V200 production PostgreSQL role separation
-- Creates NOLOGIN group roles only. Real login credentials are provisioned outside source control.
-- Apply after all schema/capacity/auth-hardening SQL.

begin;

do $roles$
begin
  if not exists(select 1 from pg_roles where rolname='tsubame_migrator') then
    create role tsubame_migrator nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='tsubame_app_runtime') then
    create role tsubame_app_runtime nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
  if not exists(select 1 from pg_roles where rolname='tsubame_maintenance') then
    create role tsubame_maintenance nologin nosuperuser nocreatedb nocreaterole noreplication nobypassrls;
  end if;
end
$roles$;

alter schema public owner to tsubame_migrator;
revoke create on schema public from public;
revoke all on all tables in schema public from public;
revoke all on all sequences in schema public from public;

do $owners$
declare r record;
begin
  for r in
    select c.relname,c.relkind
      from pg_class c join pg_namespace n on n.oid=c.relnamespace
     where n.nspname='public' and c.relkind in ('r','p','S','v','m')
  loop
    if r.relkind in ('r','p') then
      execute format('alter table public.%I owner to tsubame_migrator',r.relname);
    elsif r.relkind='S' then
      execute format('alter sequence public.%I owner to tsubame_migrator',r.relname);
    elsif r.relkind='v' then
      execute format('alter view public.%I owner to tsubame_migrator',r.relname);
    elsif r.relkind='m' then
      execute format('alter materialized view public.%I owner to tsubame_migrator',r.relname);
    end if;
  end loop;
end
$owners$;

alter function public.reject_append_only_mutation() owner to tsubame_migrator;

grant usage on schema public to tsubame_app_runtime;
grant select,insert,update on all tables in schema public to tsubame_app_runtime;

-- Retired employee self-service workflow tables are kept for rollback/audit compatibility,
-- but the production application runtime must not read or mutate them.
-- Manager-to-manager handoffs remain active and are intentionally not included here.
revoke select,insert,update,delete on
  public.applications,
  public.notices,
  public.notice_reads,
  public.confirmations,
  public.confirmation_responses
from tsubame_app_runtime;

-- Runtime deletes are intentionally narrow.
grant delete on public.user_scopes,public.user_feature_permissions,public.drafts,public.login_rate_limits,public.work_summary_monthly to tsubame_app_runtime;

-- Immutable evidence/audit tables are insert/select only at privilege level,
-- in addition to database append-only triggers.
revoke update,delete on public.audit_logs from tsubame_app_runtime;
revoke update,delete on public.record_histories from tsubame_app_runtime;
revoke update,delete on public.employee_number_history from tsubame_app_runtime;

grant usage,select on all sequences in schema public to tsubame_app_runtime;

-- Maintenance is intentionally narrower than migrator/owner.
grant usage on schema public to tsubame_maintenance;
grant select,update,delete on
  public.auth_sessions,
  public.mfa_challenges,
  public.password_reset_tokens,
  public.login_rate_limits,
  public.work_import_batches,
  public.work_import_rows
to tsubame_maintenance;
revoke insert,update,delete on public.employees from tsubame_maintenance;
revoke insert,update,delete on public.audit_logs from tsubame_maintenance;
revoke insert,update,delete on public.record_histories from tsubame_maintenance;

commit;
