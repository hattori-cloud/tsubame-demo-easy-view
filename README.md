# つばめ交通 社員一元管理システム

Vercel production deployment source.

Current application: v85 foundation build.
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
- Readability improvements for typography, spacing, tables, forms, and responsive layout
- Simplified home and core operational screens
- Vehicle management in the primary navigation
- Communication screen split into Notice / Confirmation / Application tabs
- Administration screen focused on today's actions with collapsible operational, system, and audit sections
- Unified search/filter toolbars and consistent list actions across major screens
- Prioritized detail screens and prioritized input forms
- Dynamic Japan business date (Asia/Tokyo)
- Actionable data-quality dashboard with direct navigation and CSV export
- Critical data-quality issues surfaced in the daily action queue
- Office and department are managed independently: HQ and Fuchu may use any department; Maki is restricted to the Bus Department
- Application release schema and core-record schema are separated: app v85.0 / core data core-2.0
- Existing browser records are migrated to the current core data schema at startup
- Backups record both app schema and core data schema; older backups show a migration warning before restore

Production note: the shared demo uses fictional data and browser storage. Real employee data must wait for production authentication, server-side authorization, database, backup, and audit infrastructure.
