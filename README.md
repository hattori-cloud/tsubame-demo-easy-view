# つばめ交通 社員一元管理システム

Vercel production deployment source.

Current application: v97 foundation build.
- Employee / work / vehicle / communication management
- Accident / near-miss / complaint management and analysis
- Role and scope controls for demo verification
- Global search with category filtering and scoped permissions
- Unified administrator daily action center for deadlines, safety cases, handoffs, applications, and critical data-quality issues
- Prioritized detail screens and collapsible input forms with required-field validation
- Dynamic Japan business date (Asia/Tokyo)
- Actionable data-quality dashboard with direct navigation and CSV export
- Office and department are managed independently: HQ and Fuchu may use any department; Maki is restricted to the Bus Department
- Application release schema and core-record schema are separated: app v97.0 / core data core-2.0
- Employee counts are flexible; 120 fictional employees are only the initial seed
- Backup restore is transactional: pre-restore snapshot, post-write verification, and automatic rollback on failure
- Normal operational saves are transactional across core datasets with post-write verification and rollback
- Operational audit logs are committed in the same transaction as business data; audit-only actions use verified standalone persistence
- Administrator system self-diagnostics check required screen IDs, duplicate DOM IDs, key functions, permission policy, core collections, app/core schemas, boot migrations, company office/department rules, browser-storage read/write/delete, transactional save targets, and critical data-quality status
- Production migration gate summarizes hard blockers, decision items, and completed prerequisites before real employee data can be introduced
- Employee detail management summary surfaces open accidents, open complaints, recent near-misses, and deadline attention in one place
- Accident detail includes a visible completion/management checklist aligned with the existing completion rules
- Near-miss detail now checks analysis completeness without turning reports into manager-owned cases
- Complaint detail highlights missing response/closure information such as rank, owner, follow-up and completion records
- Employee create/edit flows warn about missing driver-critical deadlines and confirm the resulting safety state before save
- Home daily summary now surfaces deadlines, stale work summaries, credential/document attention, and vehicle checks before opening each module
- Work detail provides a dedicated employee-level view of restraint/overtime, posting freshness, next action, and health-check deadline without exposing medical results
- Credential/document center supports attention filters for overdue items, missing evidence links, and pending document verification
- Vehicle detail checks inspection date, vehicle status, assigned employee state, and driver eligibility together while keeping actual dispatch decisions in normal operations
- Vehicle records now support call sign, model, next maintenance check, and a lightweight maintenance note with live pre-save warnings
- Qualification rows show overdue/soon/missing-evidence counts and can jump directly into evidence document registration
- Qualification and document forms now provide live deadline/evidence/linkage guidance while preserving separate qualification/document records
- Vehicle assignment now supports dedicated, shared, spare and temporary-replacement modes while retaining one primary responsible employee for scope and accountability
- Vehicles can register multiple regular users without treating that list as the daily dispatch log; safety checks cover every registered driver
- Employee transfer/leave/retirement changes require explicit handoff checks and a handoff note, record a transition history, and surface open accidents, complaints, vehicles, assets and training items
- Leave/retirement procedure checklists now include vehicle, open-case, access, qualification and safety-training handoff steps
- Self-diagnostic results show Normal / Warning / Needs attention and are available from the System Foundation section

Production note: the shared demo still uses fictional data and browser storage. Real employee data must wait for production authentication, server-side authorization, database, backup, and audit infrastructure.
