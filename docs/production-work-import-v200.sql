-- V200 work-summary import persistence
-- Stores normalized monthly work summaries and reversible import batches.
-- The original XLSX file is not stored in PostgreSQL.

begin;

create table if not exists work_import_batches (
  id uuid primary key default gen_random_uuid(),
  file_name text not null,
  content_sha256 char(64) not null
    check (content_sha256 ~ '^[0-9a-f]{64}$'),
  created_by_user_id uuid not null references users(id),
  state text not null default 'preflight'
    check (state in ('preflight','committed','rolled_back','expired')),
  row_count integer not null default 0 check (row_count >= 0),
  warning_count integer not null default 0 check (warning_count >= 0),
  expires_at timestamptz not null,
  committed_at timestamptz,
  rolled_back_at timestamptz,
  rollback_reason text,
  request_id text,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  check (expires_at > created_at)
);

create table if not exists work_summary_monthly (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  month_start date not null check (extract(day from month_start)=1),
  restraint_hours numeric(8,2) not null check (restraint_hours between 0 and 1000),
  remaining_hours numeric(8,2) not null check (remaining_hours between 0 and 1000),
  overtime_hours numeric(8,2) not null check (overtime_hours between 0 and 1000),
  last_posted_on date not null,
  source_batch_id uuid references work_import_batches(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  unique (employee_id, month_start)
);

create table if not exists work_import_rows (
  id uuid primary key default gen_random_uuid(),
  batch_id uuid not null references work_import_batches(id) on delete cascade,
  row_no integer not null check (row_no > 0),
  employee_id uuid not null references employees(id),
  employee_no_snapshot text not null,
  month_start date not null check (extract(day from month_start)=1),
  before_data jsonb,
  after_data jsonb not null,
  committed_version integer,
  result text not null default 'preflight'
    check (result in ('preflight','committed','rolled_back')),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  unique (batch_id,row_no)
);

create index if not exists work_import_batches_actor_state_idx
  on work_import_batches (created_by_user_id,state,created_at desc);

create index if not exists work_import_batches_hash_idx
  on work_import_batches (content_sha256,created_at desc);

create index if not exists work_summary_monthly_employee_month_idx
  on work_summary_monthly (employee_id,month_start desc);

create index if not exists work_summary_monthly_source_batch_idx
  on work_summary_monthly (source_batch_id);

create index if not exists work_import_rows_batch_idx
  on work_import_rows (batch_id,row_no);

commit;
