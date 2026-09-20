# つばめ交通 社員一元管理システム

Vercel production deployment source.

Current application: v89 foundation build.
- Employee / work / vehicle / communication management
- Accident / near-miss / complaint management and analysis
- Role and scope controls for demo verification
- Global search with category filtering and scoped permissions
- Unified administrator daily action center for deadlines, safety cases, handoffs, applications, and critical data-quality issues
- Prioritized detail screens and collapsible input forms with required-field validation
- Dynamic Japan business date (Asia/Tokyo)
- Actionable data-quality dashboard with direct navigation and CSV export
- Office and department are managed independently: HQ and Fuchu may use any department; Maki is restricted to the Bus Department
- Application release schema and core-record schema are separated: app v89.0 / core data core-2.0
- Employee counts are flexible; 120 fictional employees are only the initial seed
- Backup restore preflight blocks duplicate employee numbers, orphan references, duplicate record IDs, invalid offices/departments, and Maki non-bus assignments
- Backup restore is transactional: pre-restore snapshot, post-write verification, and automatic rollback on failure
- Normal operational saves are also transactional across employee, accident, complaint, near-miss, vehicle, qualification, document, application, notice, confirmation, handoff, and related core datasets
- Normal saves re-read every written key before success is accepted; any mismatch or storage exception rolls all written keys back to their prior browser-storage values
- All operational save call sites stop immediately after a failed save so later screen transitions do not continue as if the save succeeded

Production note: the shared demo still uses fictional data and browser storage. Real employee data must wait for production authentication, server-side authorization, database, backup, and audit infrastructure.
