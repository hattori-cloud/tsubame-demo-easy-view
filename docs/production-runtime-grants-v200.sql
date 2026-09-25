-- V200 production runtime grants
-- Apply after production-schema.sql and production-capacity-v189.sql.
-- Role tsubame_app must already exist and must not own schema/tables.

begin;

revoke create on schema public from public;
revoke all privileges on all tables in schema public from tsubame_app;

grant usage on schema public to tsubame_app;
grant select on all tables in schema public to tsubame_app;

grant insert, update on
  employees,
  users,
  user_scopes,
  auth_sessions,
  password_reset_tokens,
  login_rate_limits,
  mfa_challenges,
  qualifications,
  documents,
  document_policy_rules,
  document_purge_requests,
  safety_training,
  assets,
  accidents,
  near_misses,
  complaints,
  guidance_records,
  vehicles,
  vehicle_users,
  applications,
  notices,
  confirmations,
  notice_reads,
  confirmation_responses,
  handoffs,
  drafts,
  work_import_batches,
  work_monthly_summaries,
  near_miss_monthly_targets
to tsubame_app;

grant insert on
  employee_number_history,
  work_import_changes,
  record_histories,
  audit_logs
to tsubame_app;

grant delete on
  user_scopes,
  drafts,
  work_monthly_summaries
to tsubame_app;

grant select on near_miss_monthly_compliance to tsubame_app;

commit;
