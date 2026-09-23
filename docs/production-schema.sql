-- つばめ交通 社員一元管理システム
-- Production schema canonical baseline
-- Normalized in v197 after audit found duplicated CREATE TABLE/INDEX blocks.
-- Review and apply only to an empty/staging PostgreSQL database first.
-- Real employee data must not be loaded until authentication, authorization,
-- backup/restore, object storage, and migration reconciliation are complete.

begin;

create extension if not exists pgcrypto;

create table employees (
  id uuid primary key default gen_random_uuid(),
  employee_no text not null unique,
  name text not null,
  furigana text,
  office text not null,
  department text not null,
  position text,
  taxi_section text,
  team text,
  employment_type text,
  lifecycle_status text not null default 'active'
    check (lifecycle_status in ('active','leave','retirement_planned','retired')),
  work_pattern text,
  main_license text,
  license_expiry date,
  health_check_due date,
  aptitude_due date,
  safety_state text,
  eligibility text,
  hired_on date,
  retired_on date,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1)
);

create table users (
  id uuid primary key default gen_random_uuid(),
  external_subject text unique,
  employee_id uuid references employees(id),
  display_name text not null,
  role_level text not null check (role_level in ('full','scoped','self')),
  safety_authority boolean not null default false,
  state text not null default 'active' check (state in ('active','suspended')),
  mfa_required boolean not null default true,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1)
);

create table user_scopes (
  id uuid primary key default gen_random_uuid(),
  user_id uuid not null references users(id) on delete cascade,
  office text not null,
  department text not null,
  created_at timestamptz not null default now(),
  unique (user_id, office, department)
);

create table qualifications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  name text not null,
  certificate_no text,
  expiry date,
  status text not null default 'active',
  evidence_requirement text not null default 'unset'
    check (evidence_requirement in ('required','not_required','unset')),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1)
);

create table documents (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  qualification_id uuid references qualifications(id),
  category text not null,
  name text not null,
  kind text,
  registered_on date not null,
  expiry date,
  status text not null default 'pending'
    check (status in ('pending','verified','replacement_due','replaced','invalid')),
  security_class text not null default 'restricted'
    check (security_class in ('standard','restricted','strict')),
  access_level text not null default 'scope_admin'
    check (access_level in ('self_allowed','scope_admin','full_admin')),
  original_handling text not null default 'electronic_original'
    check (original_handling in ('employee_original_company_copy','company_paper_original','electronic_original','paper_and_electronic')),
  paper_location text,
  retention_until date,
  storage_key text,
  storage_version_id text,
  content_sha256 char(64) check (content_sha256 is null or content_sha256 ~ '^[0-9a-f]{64}

create table safety_training (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  course text not null,
  due date,
  status text not null default 'open',
  completed_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1)
);

create table assets (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  item text not null,
  asset_no text not null unique,
  return_due date,
  status text not null default 'loaned',
  returned_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1)
);

create table accidents (
  id uuid primary key default gen_random_uuid(),
  accident_no text not null unique,
  employee_id uuid not null references employees(id),
  occurred_on date not null,
  occurred_time time,
  car_no text check (car_no is null or car_no ~ '^[0-9]{3}$'),
  district text,
  accident_type text,
  fault_rate integer check (fault_rate between 0 and 100),
  opponent_repair_status text,
  opponent_repair_cost integer check (opponent_repair_cost is null or opponent_repair_cost >= 0),
  company_repair_status text,
  company_repair_cost integer check (company_repair_cost is null or company_repair_cost >= 0),
  address text not null,
  summary text not null,
  phase text not null default 'initial',
  cause text,
  prevention text,
  response_history text,
  owner_user_id uuid references users(id),
  next_action text,
  followup_due date,
  completed_at timestamptz,
  completed_by_user_id uuid references users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1)
);

create table near_misses (
  id uuid primary key default gen_random_uuid(),
  report_no text not null unique,
  employee_id uuid not null references employees(id),
  occurred_on date not null,
  occurred_time time,
  reported_on date not null,
  car_no text check (car_no is null or car_no ~ '^[0-9]{3}$'),
  summary text not null,
  prevention text,
  education text,
  risk_level text,
  cause_side text,
  employee_no_at_report text not null,
  office_at_report text not null,
  department_at_report text not null,
  location_tags jsonb not null default '[]'::jsonb,
  situation_tags jsonb not null default '[]'::jsonb,
  road_tags jsonb not null default '[]'::jsonb,
  target_tags jsonb not null default '[]'::jsonb,
  internal_factors jsonb not null default '[]'::jsonb,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1)
);

create table complaints (
  id uuid primary key default gen_random_uuid(),
  complaint_no text not null unique,
  employee_id uuid not null references employees(id),
  responded_on date not null,
  responded_time time,
  responder text,
  occurrence_date date,
  occurrence_time time,
  car_no text check (car_no is null or car_no ~ '^[0-9]{3}$'),
  customer_alias text,
  summary text not null,
  rank text not null default 'unrated',
  owner_user_id uuid references users(id),
  guidance_content text,
  next_action text,
  followup_due date,
  status text not null default 'open',
  completed_at timestamptz,
  completed_by_user_id uuid references users(id),
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1)
);

create table guidance_records (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  guidance_on date not null,
  type text not null,
  summary text not null,
  owner text not null,
  next_review date,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1)
);

create table vehicles (
  id uuid primary key default gen_random_uuid(),
  car_no text not null unique check (car_no ~ '^[0-9]{3}$'),
  service text,
  status text not null default 'active',
  assignment_mode text not null default 'dedicated',
  primary_employee_id uuid references employees(id),
  inspection_due date not null,
  next_maintenance_due date,
  maintenance_note text,
  archived_at timestamptz,
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1)
);

create table vehicle_users (
  id uuid primary key default gen_random_uuid(),
  vehicle_id uuid not null references vehicles(id) on delete cascade,
  employee_id uuid not null references employees(id),
  role text not null check (role in ('primary','additional')),
  assigned_on date not null default current_date,
  ended_on date,
  created_at timestamptz not null default now(),
  unique (vehicle_id, employee_id, role, assigned_on)
);

create table applications (
  id uuid primary key default gen_random_uuid(),
  employee_id uuid not null references employees(id),
  type text not null,
  status text not null default 'submitted',
  payload jsonb not null default '{}'::jsonb,
  applied_at timestamptz not null default now(),
  decided_at timestamptz,
  decided_by_user_id uuid references users(id),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1)
);

create table notices (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text not null,
  state text not null default 'draft',
  published_at timestamptz,
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1)
);

create table confirmations (
  id uuid primary key default gen_random_uuid(),
  title text not null,
  body text,
  due date,
  state text not null default 'open',
  created_by_user_id uuid references users(id),
  created_at timestamptz not null default now(),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1)
);

create table handoffs (
  id uuid primary key default gen_random_uuid(),
  case_type text not null,
  case_id text not null,
  employee_id uuid references employees(id),
  from_user_id uuid references users(id),
  to_user_id uuid not null references users(id),
  status text not null default 'pending',
  note text,
  created_at timestamptz not null default now(),
  acknowledged_at timestamptz
);

create table drafts (
  id uuid primary key default gen_random_uuid(),
  owner_user_id uuid not null references users(id) on delete cascade,
  kind text not null check (kind in ('accident','near_miss','complaint')),
  payload jsonb not null default '{}'::jsonb,
  saved_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  unique (owner_user_id, kind)
);

create table record_histories (
  id uuid primary key default gen_random_uuid(),
  entity_type text not null,
  entity_id text not null,
  employee_id uuid references employees(id),
  actor_user_id uuid references users(id),
  action text not null,
  before_data jsonb,
  after_data jsonb,
  reason text,
  occurred_at timestamptz not null default now()
);

create table audit_logs (
  id uuid primary key default gen_random_uuid(),
  occurred_at timestamptz not null default now(),
  actor_user_id uuid references users(id),
  action text not null,
  entity_type text not null,
  entity_id text not null,
  employee_id uuid references employees(id),
  result text not null default 'success',
  request_id text,
  summary text
);

create index employees_scope_idx on employees (office, department, lifecycle_status, employee_no);
create index employees_name_idx on employees (name);
create index employees_deadline_idx on employees (license_expiry, health_check_due, aptitude_due);
create index employees_retired_on_idx on employees (retired_on desc) where lifecycle_status = 'retired';

create index users_employee_idx on users (employee_id);
create index users_state_role_idx on users (state, role_level);
create index user_scopes_scope_idx on user_scopes (office, department, user_id);

create index qualifications_employee_idx on qualifications (employee_id, expiry, status);
create index documents_employee_idx on documents (employee_id, category, status);
create index documents_expiry_idx on documents (expiry, status);
create unique index documents_storage_key_uidx on documents (storage_key) where storage_key is not null;
create index documents_security_idx on documents (security_class, access_level, status, registered_on desc);
create index documents_retention_idx on documents (retention_until, status) where archived_at is null;
create index safety_training_due_idx on safety_training (employee_id, status, due);
create index assets_employee_idx on assets (employee_id, status, return_due);

create index accidents_employee_date_idx on accidents (employee_id, occurred_on desc, id);
create index accidents_phase_due_idx on accidents (phase, followup_due, id);
create index accidents_owner_idx on accidents (owner_user_id, phase, followup_due);
create index accidents_car_no_idx on accidents (car_no, occurred_on desc);

create index near_misses_employee_date_idx on near_misses (employee_id, reported_on desc, id);
create index near_misses_risk_idx on near_misses (risk_level, reported_on desc, id);
create index near_misses_car_no_idx on near_misses (car_no, reported_on desc);
create index near_misses_office_department_idx on near_misses (office_at_report, department_at_report, reported_on desc, id);
create index near_misses_active_reported_idx on near_misses (reported_on desc, id) where archived_at is null;

create index complaints_employee_date_idx on complaints (employee_id, responded_on desc, id);
create index complaints_status_due_idx on complaints (status, followup_due, id);
create index complaints_owner_idx on complaints (owner_user_id, status, followup_due);
create index complaints_car_no_idx on complaints (car_no, responded_on desc);

create index guidance_employee_date_idx on guidance_records (employee_id, guidance_on desc, id);
create index vehicles_status_due_idx on vehicles (status, inspection_due, id);
create index vehicles_primary_employee_idx on vehicles (primary_employee_id, status);
create index vehicle_users_employee_idx on vehicle_users (employee_id, ended_on, vehicle_id);

create index applications_employee_status_idx on applications (employee_id, status, applied_at desc);
create index notices_state_published_idx on notices (state, published_at desc);
create index confirmations_state_due_idx on confirmations (state, due);
create index handoffs_to_user_idx on handoffs (to_user_id, status, created_at desc);
create index handoffs_case_idx on handoffs (case_type, case_id);
create index drafts_owner_idx on drafts (owner_user_id, saved_at desc);
create index histories_entity_idx on record_histories (entity_type, entity_id, occurred_at desc);
create index histories_employee_idx on record_histories (employee_id, occurred_at desc);
create index audit_entity_idx on audit_logs (entity_type, entity_id, occurred_at desc);
create index audit_actor_idx on audit_logs (actor_user_id, occurred_at desc);
create index audit_employee_idx on audit_logs (employee_id, occurred_at desc);

commit;

-- High-volume / monthly-target additions live in:
-- docs/production-capacity-v189.sql
-- That file is additive and uses IF NOT EXISTS where appropriate.
