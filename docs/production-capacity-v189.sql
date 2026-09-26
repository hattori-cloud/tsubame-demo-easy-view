-- つばめ交通 社員一元管理システム
-- High-volume production capacity addendum
-- Assumptions: 310+ current employees, retired employees retained,
-- about 200 taxi drivers, two near-miss reports per taxi driver per month
-- (= about 4,800 near-miss reports/year), 5+ years of retention.
--
-- This file is intentionally additive. Apply it only after the base production
-- schema has been reviewed and normalized. No real employee data belongs here.

begin;

-- Retired employees remain in the employee master. They are not hard-deleted.
-- V200 base schema already defines employees.retired_on and its index.

create index if not exists employees_lifecycle_office_dept_idx
  on employees (lifecycle_status, office, department, employee_no);

-- A near-miss report preserves organization context at submission time so later
-- transfers do not rewrite historical monthly results.
-- V200 base schema already defines reported_on, summary and the reporting snapshots.

-- Backfill candidates for staging/migration only. Production migration must
-- validate these values before making them NOT NULL.
update near_misses n
set
  reported_on = coalesce(n.reported_on, n.occurred_on),
  employee_no_at_report = coalesce(n.employee_no_at_report, e.employee_no),
  office_at_report = coalesce(n.office_at_report, e.office),
  department_at_report = coalesce(n.department_at_report, e.department)
from employees e
where e.id = n.employee_id
  and (
    n.reported_on is null
    or n.employee_no_at_report is null
    or n.office_at_report is null
    or n.department_at_report is null
  );

-- Do this only after migration reconciliation has confirmed zero nulls:
-- alter table near_misses alter column reported_on set not null;
-- alter table near_misses alter column employee_no_at_report set not null;
-- alter table near_misses alter column office_at_report set not null;
-- alter table near_misses alter column department_at_report set not null;

alter table near_misses
  add column if not exists source_type text not null default 'system',
  add column if not exists external_ref text;

do $
begin
  if not exists(
    select 1 from pg_constraint
     where conname='near_misses_source_type_check'
       and conrelid='near_misses'::regclass
  ) then
    alter table near_misses
      add constraint near_misses_source_type_check
      check (source_type in ('system','google_form','paper'));
  end if;
end $;

create unique index if not exists near_misses_source_ref_unique
  on near_misses(source_type,external_ref)
  where external_ref is not null and archived_at is null;

-- High-volume list/search indexes. The UI/API should still paginate; indexes
-- prevent each request from scanning all historical near-miss rows.
-- V200 base schema already provides employee+reported_on, office+department+reported_on,
-- and active reported_on indexes. This addendum only creates capacity indexes that
-- are not already present in the canonical base schema.
create index if not exists near_misses_reported_on_idx
  on near_misses (reported_on desc, id);

create index if not exists near_misses_department_reported_idx
  on near_misses (department_at_report, reported_on desc, id);

-- Monthly target snapshot.
-- The target population is frozen per month so later transfers/retirements do
-- not change an already-closed month's compliance result.
-- Business exceptions (mid-month hire, leave, etc.) are NOT hard-coded here;
-- they must be approved explicitly as required/exempt for that month.
create table if not exists near_miss_monthly_targets (
  id uuid primary key default gen_random_uuid(),
  month_start date not null,
  employee_id uuid not null references employees(id),
  employee_no_snapshot text not null,
  employee_name_snapshot text not null,
  office_snapshot text not null,
  department_snapshot text not null,
  target_count smallint not null default 2 check (target_count >= 0 and target_count <= 31),
  requirement_state text not null default 'required'
    check (requirement_state in ('required','exempt')),
  exemption_reason text,
  created_at timestamptz not null default now(),
  created_by_user_id uuid references users(id),
  updated_by_user_id uuid references users(id),
  updated_at timestamptz not null default now(),
  version integer not null default 1 check (version >= 1),
  unique (month_start, employee_id),
  check (date_trunc('month', month_start)::date = month_start),
  check (
    requirement_state = 'required'
    or (requirement_state = 'exempt' and nullif(trim(exemption_reason),'') is not null)
  )
);

create index if not exists near_miss_monthly_targets_month_idx
  on near_miss_monthly_targets (month_start desc, requirement_state, office_snapshot, department_snapshot);

create index if not exists near_miss_monthly_targets_employee_idx
  on near_miss_monthly_targets (employee_id, month_start desc);

-- Monthly compliance view: count by submission/report date, not incident date.
-- This catches a case where the department total reaches 400 but an individual
-- driver still submitted only 0 or 1 report.
create or replace view near_miss_monthly_compliance as
select
  t.month_start,
  t.employee_id,
  t.employee_no_snapshot,
  t.employee_name_snapshot,
  t.office_snapshot,
  t.department_snapshot,
  t.target_count,
  t.requirement_state,
  t.exemption_reason,
  count(n.id) filter (where n.archived_at is null)::integer as submitted_count,
  greatest(
    t.target_count - count(n.id) filter (where n.archived_at is null)::integer,
    0
  ) as remaining_count,
  case
    when t.requirement_state = 'exempt' then 'exempt'
    when count(n.id) filter (where n.archived_at is null) >= t.target_count then 'met'
    when count(n.id) filter (where n.archived_at is null) = 0 then 'zero'
    else 'short'
  end as compliance_state
from near_miss_monthly_targets t
left join near_misses n
  on n.employee_id = t.employee_id
 and n.reported_on >= t.month_start
 and n.reported_on < (t.month_start + interval '1 month')
group by
  t.month_start,
  t.employee_id,
  t.employee_no_snapshot,
  t.employee_name_snapshot,
  t.office_snapshot,
  t.department_snapshot,
  t.target_count,
  t.requirement_state,
  t.exemption_reason;

-- Useful dashboard query pattern:
-- select compliance_state, count(*)
-- from near_miss_monthly_compliance
-- where month_start = date '2027-04-01'
--   and department_snapshot = 'タクシー課'
-- group by compliance_state;

commit;
