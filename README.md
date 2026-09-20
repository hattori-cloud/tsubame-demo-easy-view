# つばめ交通 社員一元管理システム

Vercel production deployment source.

Current application: v90 foundation build.
- Employee / work / vehicle / communication management
- Accident / near-miss / complaint management and analysis
- Role and scope controls for demo verification
- Global search with category filtering and scoped permissions
- Unified administrator daily action center for deadlines, safety cases, handoffs, applications, and critical data-quality issues
- Prioritized detail screens and collapsible input forms with required-field validation
- Dynamic Japan business date (Asia/Tokyo)
- Actionable data-quality dashboard with direct navigation and CSV export
- Office and department are managed independently: HQ and Fuchu may use any department; Maki is restricted to the Bus Department
- Application release schema and core-record schema are separated: app v90.0 / core data core-2.0
- Employee counts are flexible; 120 fictional employees are only the initial seed
- Backup restore is transactional: pre-restore snapshot, post-write verification, and automatic rollback on failure
- Normal operational saves are transactional across core datasets with post-write verification and rollback
- Operational audit logs are now committed in the same transaction as business data when a save follows in the same action
- Audit-only operations such as CSV export or printing use standalone verified audit persistence
- Pending standalone audit writes are absorbed by the next transactional save to prevent “data saved / audit missing” or “audit saved / data failed” mismatches

Production note: the shared demo still uses fictional data and browser storage. Real employee data must wait for production authentication, server-side authorization, database, backup, and audit infrastructure.
