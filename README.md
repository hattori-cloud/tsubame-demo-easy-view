# つばめ交通 社員一元管理システム

Vercel production deployment source.

Current application: v92 foundation build.
- Employee / work / vehicle / communication management
- Accident / near-miss / complaint management and analysis
- Role and scope controls for demo verification
- Global search with category filtering and scoped permissions
- Unified administrator daily action center for deadlines, safety cases, handoffs, applications, and critical data-quality issues
- Prioritized detail screens and collapsible input forms with required-field validation
- Dynamic Japan business date (Asia/Tokyo)
- Actionable data-quality dashboard with direct navigation and CSV export
- Office and department are managed independently: HQ and Fuchu may use any department; Maki is restricted to the Bus Department
- Application release schema and core-record schema are separated: app v92.0 / core data core-2.0
- Employee counts are flexible; 120 fictional employees are only the initial seed
- Backup restore is transactional: pre-restore snapshot, post-write verification, and automatic rollback on failure
- Normal operational saves are transactional across core datasets with post-write verification and rollback
- Operational audit logs are committed in the same transaction as business data; audit-only actions use verified standalone persistence
- Administrator system self-diagnostics check required screen IDs, duplicate DOM IDs, key functions, permission policy, core collections, app/core schemas, boot migrations, company office/department rules, browser-storage read/write/delete, transactional save targets, and critical data-quality status
- Production migration gate summarizes hard blockers, decision items, and completed prerequisites before real employee data can be introduced
- Self-diagnostic results show Normal / Warning / Needs attention and are available from the System Foundation section

Production note: the shared demo still uses fictional data and browser storage. Real employee data must wait for production authentication, server-side authorization, database, backup, and audit infrastructure.
