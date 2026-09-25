-- V200 distributed login rate-limit persistence
-- Apply after docs/production-schema.sql and before/after capacity additions.
-- No real employee data is stored here.

begin;

create table if not exists login_rate_limits (
  key_hash char(64) primary key
    check (key_hash ~ '^[0-9a-f]{64}$'),
  kind text not null
    check (kind in ('source','source_login')),
  window_started_at timestamptz not null default now(),
  failure_count integer not null default 0 check (failure_count >= 0),
  blocked_until timestamptz,
  updated_at timestamptz not null default now()
);

create index if not exists login_rate_limits_blocked_idx
  on login_rate_limits (blocked_until)
  where blocked_until is not null;

create index if not exists login_rate_limits_updated_idx
  on login_rate_limits (updated_at);

commit;
