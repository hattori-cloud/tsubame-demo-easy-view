# つばめ交通 社員一元管理システム

Vercel production deployment source.

Current application: v88 foundation build.
- Employee / work / vehicle / communication management
- Accident / near-miss / complaint management and analysis
- Role and scope controls for demo verification
- Validated browser-storage backup / restore for the shared demo
- Global search with category filtering
- Permission matrix for administrator review
- Unified administrator daily action center for deadlines, safety cases, handoffs, applications, and critical data-quality issues
- Common next-action guidance across employee, work, vehicle, and application screens
- Unified required-field validation and pre-save change confirmation for core edit forms
- Unsaved-form protection for close / Escape / page unload
- Simplified home and core operational screens with unified search/list/detail/form interactions
- Dynamic Japan business date (Asia/Tokyo)
- Actionable data-quality dashboard with direct navigation and CSV export
- Critical data-quality issues surfaced in the daily action queue
- Office and department are managed independently: HQ and Fuchu may use any department; Maki is restricted to the Bus Department
- Application release schema and core-record schema are separated: app v88.0 / core data core-2.0
- Employee counts are flexible; 120 fictional employees are only the initial seed and saved employee counts survive reloads and app upgrades
- Backup restore preflight blocks duplicate employee numbers, orphan references, duplicate record IDs, invalid offices/departments, and Maki non-bus assignments
- Backup restore is transactional at the browser-storage level: current data is snapshotted before restore, restored keys are re-read and revalidated after write, and failures trigger automatic rollback
- Successful restore is recorded only after post-write verification completes

Production note: the shared demo uses fictional data and browser storage. Real employee data must wait for production authentication, server-side authorization, database, backup, and audit infrastructure.
