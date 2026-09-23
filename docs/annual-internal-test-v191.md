# Annual internal load test — v191

## Purpose

Validate the employee management system against one year of realistic operating volume while keeping all data fictional.

This test covers data growth, record linkage, list usability, monthly near-miss submission monitoring, retirement retention, and the point where browser-local storage stops being an acceptable production architecture.

## Operating assumptions

- Starting current employees: approximately 310
- New hires during the year: 50
- Retirements during the year: 30
- Retired employees remain in the employee master and keep historical links
- End-of-year active employees: approximately 330
- End-of-year employee master rows: approximately 360
- Taxi drivers used for monthly near-miss target testing: approximately 200
- Near-miss rule: two submissions per taxi driver per month
- Near-miss load: approximately 400/month, 4,800/year
- Accident load: approximately 20/month, 240/year
- Complaint load used in the synthetic test: 60/year
- Safety-training records: 96/year
- Qualification records: 180/year
- Document metadata records: 120/year
- Application records: 96/year

The complaint/training/qualification/document/application counts are synthetic load-test values. The employee, near-miss, and accident assumptions reflect the operating conditions supplied for this test.

## One-year generated result

| Record type | Rows |
| --- | ---: |
| Employee master at year end | 360 |
| Active employees at year end | 330 |
| Retired employee rows retained | 30 |
| Near misses | 4,800 |
| Accidents | 240 |
| Complaints | 60 |
| Safety training | 96 |
| Qualifications | 180 |
| Documents | 120 |
| Applications | 96 |
| Operational records above, excluding employee rows/audit | 5,592 |

The synthetic run completed with zero dangling employee references.

Each of the twelve test months contains 20 accident records.

## Near-miss monthly target test

A special April scenario intentionally keeps the taxi-department total at 400 submissions while making:

- 10 drivers submit only one report each,
- another 10 drivers submit three reports each.

The aggregate still equals 400, but the individual compliance calculation correctly reports 10 short drivers.

This proves the monthly monitor must evaluate every target driver and must not treat a department total of 400 as sufficient evidence of compliance.

Production monthly target membership must be snapshotted so later transfers, leave, hires, or retirements do not rewrite a closed month's result.

## Usability / readability findings

The original browser demo had several list-growth risks. The following changes were made during the test:

- Near-miss list: 20 rows per page
- Complaint list: 20 rows per page
- Deadline center: 25 rows per page
- Qualification/document center: 25 rows per page
- Employee-specific near-miss history: 25 rows per page
- Employee combined safety timeline: 25 rows per page
- Employee-specific complaint history: 25 rows per page
- Accident list/history already used bounded paging
- Home global search now waits briefly before rescanning data instead of recalculating on every keystroke
- Taxi-driver near-miss submission monitor separates 0 / 1 / 2-or-more reports and can show only unmet drivers

These changes keep the demo readable, but they do not make browser-local storage suitable for real production data.

## Browser-storage capacity finding

A synthetic payload approximating the current record shapes measured about **3.69 MiB** after one year with:

- 360 employee rows,
- 4,800 detailed near-miss rows,
- 240 detailed accident rows,
- 60 complaint rows,
- 96 training rows,
- 180 qualification rows,
- 120 document rows,
- 96 application rows,
- only 500 audit rows,
- no uploaded images/PDFs.

Approximate payload portions:

- Near misses: 3.20 MiB
- Employees: 0.15 MiB
- Accidents: 0.15 MiB
- Audit 500 rows: 0.10 MiB
- Other tested records: remaining portion

This is already too close to browser-origin storage limits to use localStorage as a production persistence layer. Actual quota behavior varies by browser/device, and the production system must not rely on a specific localStorage allowance.

A larger audit history, richer notes, additional modules, or attachments would increase the total further. Attachments must never be stored in localStorage.

## Five-year projection from the tested operational rows

| Record type | Approx. five-year rows |
| --- | ---: |
| Near misses | 24,000 |
| Accidents | 1,200 |
| Complaints | 300 |
| Safety training | 480 |
| Qualifications | 900 |
| Documents | 600 |
| Applications | 480 |
| Total above | 27,960 |

This total excludes employee-transition history, audit logs, vehicle history, work summaries, notices, and other operational records.

## Production architecture conclusion

Production should keep the current user-facing workflow but replace browser-wide persistence with server-side storage.

Required production behavior:

1. Managed PostgreSQL (or equivalent relational database) stores employee and business records.
2. Retired employees are retained, not hard-deleted.
3. Safety records link through stable employee UUIDs.
4. Near-miss reports preserve employee/office/department snapshots at report time.
5. Monthly near-miss target populations are snapshotted separately.
6. List/search APIs return only requested pages instead of all historical rows.
7. High-volume analysis and monthly quota counts run server-side.
8. Audit logs live server-side and are not capped by browser storage.
9. Images/PDFs use private object storage; the database stores metadata/storage keys.
10. Backups and restore verification are production requirements.

## Test artifacts

- `tests/annual-volume.test.js`
- `docs/production-capacity-v189.sql`
- `docs/api-contract.md`

The annual test should be rerun whenever retention rules, taxi-driver target rules, or major high-volume modules change.
