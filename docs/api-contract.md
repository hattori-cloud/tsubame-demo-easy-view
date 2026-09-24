# Production API Contract Draft — v200

This document is an implementation draft for the production version of the Tsubame employee/operations system.

Important:
- This repository must contain no real employee data.
- The current public app is a shared demo. Browser role switching is not authentication.
- Production authorization is enforced on the server for every request.
- Core business records use archive/state transitions rather than normal hard deletion.

## 1. Common rules

Base path:

`/api/v1`

Authentication:

- Every production request requires an authenticated individual user.
- The authenticated subject must map to an active row in `users`.
- Management accounts require MFA.
- Suspended or unregistered users are rejected before business data is loaded.
- The server derives the user's effective role and office × department scopes. Scope is never trusted from request parameters.

Recommended common response headers:

- `X-Request-Id`
- `ETag: "<version>"` on versioned resources

Recommended write request header:

- `If-Match: "<version>"`

Concurrency:

- PATCH/complete/reopen/archive operations must compare the supplied version with the current DB version.
- `If-Match` is mandatory for versioned writes; omission returns `428 Precondition Required`.
- Only a strong ETag returned by the API is accepted; wildcard and weak ETags are rejected.
- A stale version returns `409 Conflict`.
- The server must not silently overwrite a newer record.
- Shared helpers in `api/_lib/concurrency.js` centralize ETag formatting and version comparison before any production write adapter is enabled.

Common error body:

```json
{
  "error": {
    "code": "FORBIDDEN_SCOPE",
    "message": "このデータを操作する権限がありません",
    "request_id": "..."
  }
}
```

Typical status codes:

- `400` invalid input
- `401` not authenticated
- `403` authenticated but not authorized
- `404` resource not available to the current user
- `409` version conflict / invalid state transition
- `422` business-rule validation failed
- `428` required `If-Match` precondition missing
- `500` unexpected server error

## 2. Authorization model

### Full administrator

Can access company-wide records, subject to special authorities such as safety decision authority.

### Scoped administrator

Can access only employees and records inside assigned office × department scopes.

Filtering the UI never expands this scope.

### General employee

Can access only explicitly allowed self-service information for their own employee row.

### Safety authority

Separate from administrator level. Restoring driver eligibility or changing controlled safety decisions requires this authority.

## 3. Employees

### GET /api/v1/employees

Query examples:

- `q`
- `office`
- `department`
- `status`
- `risk`
- `page`
- `page_size`

The server intersects requested filters with the authenticated user's permitted scope.

### GET /api/v1/employees/{id}

Returns one visible employee and allowed related summaries.

### POST /api/v1/employees

Full administrator only.

Required minimum:

- employee_no
- name
- office
- department
- lifecycle_status

The server validates office/department company rules before insert.

### PATCH /api/v1/employees/{id}

Requires `If-Match`.

Important changes such as office, department, lifecycle status and driver eligibility create a history row.

`employee_no` is not changed through this general PATCH. Employee-number changes use the dedicated operation below so that historical numbers cannot be lost or silently reassigned.

### POST /api/v1/employees/{id}/employee-number

Full administrator only. Requires the current record version.

Request example:

```json
{
  "new_employee_no": "5678",
  "reason": "社内番号体系変更",
  "version": 4
}
```

The server performs the change in one database transaction:

1. lock the employee row and verify the submitted version,
2. normalize and validate the new employee number,
3. reject a number currently used by another employee,
4. reject a number recorded as another employee's historical number,
5. insert an append-only `employee_number_history` row with old/new number, reason, actor and timestamp,
6. update only `employees.employee_no` and increment the employee version,
7. write the audit log,
8. commit all changes together or roll everything back.

All business relations continue to use immutable `employee_id` UUIDs, so accident, complaint, qualification, document, vehicle and user links do not need foreign-key rewrites.

Historical snapshots such as `near_misses.employee_no_at_report` remain unchanged. Search by an old employee number resolves through `employee_number_history` to the same employee.

### POST /api/v1/employees/{id}/transition

Used for transfer, leave, retirement-planned and retired transitions.

Request example:

```json
{
  "target": {
    "office": "本社",
    "department": "総務課",
    "lifecycle_status": "active"
  },
  "handoff_note": "車両・事故・貸与品を確認済み",
  "checks": {
    "vehicles": true,
    "safety_cases": true,
    "assets_documents_training": true,
    "access_scope": true
  },
  "version": 4
}
```

The server calculates related open accidents, complaints, vehicles, assets and training records and writes a transition history.

## 4. Accidents

### GET /api/v1/accidents

Supports scoped search by employee, three-digit car number, date range, phase, owner, due state and keyword.

### POST /api/v1/accidents

Scoped administrator.

The server validates the target employee is in scope.

At creation time the server also freezes the employee's current `office`, `department` and `employment_type` into `office_at_record`, `department_at_record` and `employment_at_record`. These historical analysis fields are server-derived, not trusted from browser payloads, and normal PATCH operations must not rewrite them after a later transfer.

### PATCH /api/v1/accidents/{id}

Requires version match.

Important field changes are written to `record_histories`.

### POST /api/v1/accidents/{id}/complete

Completion requires:

- cause
- prevention
- response_history

The server records the reviewer and completion timestamp.

### POST /api/v1/accidents/{id}/reopen

Requires:

- reason
- current version

Reopen is audited.

### POST /api/v1/accidents/{id}/archive

Administrative correction only. No normal DELETE endpoint.

## 5. Near misses

### GET /api/v1/near-misses

Supports employee, three-digit car number, date range, risk level, cause side and keyword.

### POST /api/v1/near-misses
### PATCH /api/v1/near-misses/{id}
### POST /api/v1/near-misses/{id}/archive

Near misses remain analysis/safety-learning records and do not require a manager-owned response workflow. The optional `car_no` field uses the same three-digit company car number as accident, complaint and vehicle records.

At creation time the server freezes employee number, office, department and employment type into the report snapshot. Historical analysis uses these snapshot values first so later transfers do not rewrite a closed month's organization results. Snapshot fields are server-derived and immutable through normal PATCH.

## 6. Complaints

### GET /api/v1/complaints
### POST /api/v1/complaints
### PATCH /api/v1/complaints/{id}
### POST /api/v1/complaints/{id}/complete
### POST /api/v1/complaints/{id}/reopen
### POST /api/v1/complaints/{id}/archive

Open complaints should validate owner, next action and follow-up due date.

At creation time the server freezes the target employee's office, department and employment type into historical analysis snapshot fields. Normal complaint edits preserve that original snapshot; a later employee transfer must not move the historical complaint into the new department.

Completion writes completion date and reviewer on the server.

## 7. Qualifications and documents

### GET /api/v1/employees/{employeeId}/credentials

Returns qualifications plus document metadata visible to the user.

The response must never expose a raw object-storage key, permanent public URL, signed URL, malware engine detail or storage credential.

### POST /api/v1/qualifications
### PATCH /api/v1/qualifications/{id}

### POST /api/v1/documents/upload-ticket

Creates a **short-lived upload authorization only**. It does not create an active document record.

Server checks before issuing a ticket:

- authenticated individual user,
- active company user row,
- target employee authorization,
- document category policy,
- full-administrator role for strict categories,
- MFA-confirmed session for strict categories,
- configured file-size and allowed-content-type policy.

The ticket is bound to the authenticated user, employee, document category, expected content type/size and a random private quarantine storage key.

The storage key must not contain employee name, employee number or original file name.

The authorization expires quickly (target 60 seconds unless approved configuration changes it).

### POST /api/v1/documents/finalize

Finalizes a quarantined upload after server verification.

Required server checks:

- ticket/object ownership and expiry,
- actual object exists in private quarantine storage,
- actual object size/type is acceptable,
- SHA-256 is recorded,
- malware scan state is `clean`,
- target employee/category authorization is still valid,
- strict category still satisfies full-administrator + MFA.

If any check fails, the API must not create an active document row.

On success, the transaction writes:

- `documents` metadata,
- storage key/version,
- content type and byte size,
- SHA-256,
- upload actor/time,
- malware scan state,
- lifecycle state,
- audit log.

### POST /api/v1/documents

Metadata-only creation is allowed only for document types that intentionally have no electronic original. When a file exists, the production path is `upload-ticket` → private quarantine → scan/hash → `finalize`.

### PATCH /api/v1/documents/{id}

Updates metadata/status only.

Requires `If-Match`. Metadata changes cannot directly change server-controlled storage key, hash or malware state.

### POST /api/v1/documents/{id}/replace

Starts a new document/version workflow and links the previous record through `replaced_by_document_id` / `replaced_from_document_id`.

Replacement files must pass the same quarantine, integrity and malware checks as new files.

The old evidence is not hard-deleted.

### GET /api/v1/documents/{id}/download-ticket

Returns short-lived private-file access only after server-side authorization.

Before issuing access the server checks:

- authenticated and active user,
- target employee scope,
- document access level,
- strict-document MFA requirement,
- document lifecycle state,
- malware status is `clean`,
- storage object is active and not quarantined/blocked.

Every allow/deny decision is audited. Raw object keys and permanent URLs are not returned.

The browser must not persist the temporary access URL.

### POST /api/v1/documents/{id}/retention-review

Full administrator only.

Records a retention review note and, when an approved company rule allows it, a new retention date.

Retention expiry never auto-deletes a file.

### POST /api/v1/documents/{id}/purge-requests

Creates a physical-purge request after retention/business-rule checks.

This operation **does not delete the object**.

Required:

- full administrator,
- explicit reason,
- eligible document lifecycle/retention state,
- current resource version (`If-Match`).

### POST /api/v1/document-purge-requests/{requestId}/approve

A different authorized full administrator approves or rejects the purge request.

Requester and approver must be different users.

Approval writes an audit event. Physical purge may run only after approval.

### POST /api/v1/document-purge-requests/{requestId}/execute

Server/internal privileged operation only.

Execution must:

- re-check the approved request and document version/state,
- delete the private object,
- preserve metadata/tombstone/history,
- record provider deletion result,
- record immutable audit result.

There is no normal browser-facing hard-delete endpoint for original files.

### Original file security invariants

- private object storage only,
- random opaque storage keys,
- no employee identity/original filename in object keys,
- quarantine before activation,
- SHA-256 integrity metadata,
- malware `clean` required before normal access,
- server authorization on every upload/download,
- full-admin + MFA for strict documents,
- short-lived access authorization,
- view/download audit logging,
- replacement retains old versions,
- retention expiry triggers review, never automatic deletion,
- physical purge requires two different full administrators,
- backups must be restored and hash-verified in staging.

Full acceptance criteria live in `docs/production-document-storage-v200.md`.

## 8. Vehicles

### GET /api/v1/vehicles
### POST /api/v1/vehicles
### PATCH /api/v1/vehicles/{id}

Vehicle payload supports:

- car_no (three digits, company car number / 号車)
- model
- service
- status
- assignment_mode
- primary_employee_id
- inspection_due
- next_maintenance_due
- maintenance_note

### POST /api/v1/vehicles/{id}/assignments

Updates primary/additional registered users transactionally and writes assignment history.

This is not a daily dispatch log.

## 9. Drafts

Production drafts are separate from official records.

### GET /api/v1/drafts

Returns only the authenticated user's drafts.

### GET /api/v1/drafts/{kind}
### PUT /api/v1/drafts/{kind}
### DELETE /api/v1/drafts/{kind}

Allowed kinds:

- accident
- near_miss
- complaint

A draft is owned by exactly one user. Other users, including scoped administrators, cannot read another user's draft unless a future explicit delegation feature is designed.

Successful creation of the corresponding official record should delete that user's draft in the same logical workflow.

## 10. Applications and communications

### GET /api/v1/applications
### POST /api/v1/applications
### PATCH /api/v1/applications/{id}

### GET /api/v1/notices
### POST /api/v1/notices
### PATCH /api/v1/notices/{id}

### GET /api/v1/confirmations
### POST /api/v1/confirmations
### PATCH /api/v1/confirmations/{id}

These endpoints still use server-side scope/role validation.

## 11. Handoffs

### GET /api/v1/handoffs

Returns handoffs visible to the authenticated manager.

### POST /api/v1/handoffs
### POST /api/v1/handoffs/{id}/acknowledge

Handoff actions are audited.

## 12. Audit logs

Production audit/history persistence is append-only.

- Application roles receive INSERT/SELECT only.
- `audit_logs` and `record_histories` reject UPDATE/DELETE at the PostgreSQL trigger layer.
- Corrections are recorded as new audit/history rows; existing rows are not rewritten.
- Database-owner emergency procedures must be separately controlled and audited.

### GET /api/v1/audit-logs

Full administrator only, with filters by actor, entity type/id and date range.

There is no public POST/PATCH/DELETE audit API.

Audit rows are written by server-side business operations.

Minimum fields:

- occurred_at
- actor_user_id
- action
- entity_type
- entity_id
- employee_id when relevant
- result
- request_id
- summary

## 13. Server transaction rules

Operations that change a business record and its audit/history data must commit atomically.

Examples:

- employee transition + transition history + audit
- employee-number change + employee_number_history + audit
- accident complete + history + audit
- vehicle assignment change + assignment rows + history + audit
- document replacement + new document + old-document link + audit

If any part fails, the transaction rolls back.

## 14. Initial vertical-slice implementation

The first production/staging slice should intentionally stay small:

1. Authenticate one fictional administrator.
2. Resolve that user against the user registry.
3. Read one fictional employee through scoped API authorization.
4. Create one fictional accident.
5. Update it using version concurrency.
6. Verify audit/history rows.
7. Verify an out-of-scope user cannot retrieve or edit the same records.
8. Back up and restore the staging DB.
9. Only after this passes, expand the pattern to all modules.

## 15. Work summary XLSX preflight

### POST /api/v1/work-import/preflight

Full administrator only. This endpoint performs **preflight analysis only** and never persists the workbook or updates employee records.

Request:

- authenticated bearer token
- `Content-Type: application/octet-stream`
- `X-File-Name: <name>.xlsx`
- maximum raw workbook size: 4 MB

The server:

1. verifies authentication and full-administrator authorization,
2. parses the workbook in memory,
3. searches the first 20 rows of each worksheet for likely work-summary headers,
4. reports detected and missing fields,
5. normalizes preview values for employee number, target month, restraint time, remaining time, overtime and last-posted date,
6. flags invalid numeric/date cells and overtime of 60 hours or more,
7. returns only a bounded preview/issues result,
8. does not write business data.

The header alias list is intentionally provisional until an approved real workbook format is confirmed. A production import must not silently guess ambiguous columns.

The later confirmation endpoint must re-check the same workbook hash, employee matching, differences, current record versions and administrator approval before committing any update.

---

## 16. Out of scope

- PCA and アントレ remain planning items until their exact integration requirements are approved.


## 17. Capacity, retention and pagination

Production sizing must support the actual operating pattern rather than the small browser demo.

Current planning baseline:

- 310+ current employees at migration start,
- approximately 50 hires and 30 retirements per year,
- retired employees remain in the employee master for historical linkage,
- approximately 200 taxi-department drivers,
- two near-miss submissions per taxi driver per month,
- approximately 400 near-miss submissions per month / 4,800 per year,
- approximately 20 accident records per month / 240 per year,
- at least five years of safety, employee, audit and qualification history.

Core rules:

1. The browser must never load or save the complete production dataset as one local object.
2. Production list endpoints paginate on the server. Default page size should be 20 for high-volume safety lists and must never exceed 100.
3. Retired employees are retained and normally hidden from default active-employee views rather than deleted.
4. Safety, qualification, document and audit records retain stable employee IDs after retirement or employee-number changes.
5. Attachments live in private object storage; database rows keep metadata and storage references only.
6. Archived records remain queryable to authorized users and are excluded from ordinary lists by default.
7. Database indexes must cover the normal sort/filter paths before production migration.

For high-volume lists, offset pagination is acceptable for early staging, but cursor/keyset pagination by date + stable id is preferred for long historical lists.

Suggested near-miss query:

`GET /api/v1/near-misses?month=2027-04&page_size=20&cursor=<opaque>`

The response should contain only the current page plus counts/summaries needed by the screen. It must not return all historical near-miss rows merely to calculate the visible list.

## 18. Taxi-driver monthly near-miss target

The operating rule is measured per taxi-department driver, not by department aggregate alone.

Planning rule:

- each target taxi driver: 2 submissions per month,
- approximately 200 target drivers,
- approximately 400 submissions per month,
- approximately 4,800 submissions per year.

A department total of 400 does **not** prove compliance. The server must calculate each driver's submitted count and identify 0 / 1 / 2-or-more submissions separately.

### GET /api/v1/near-miss-compliance

Query examples:

- `month=2027-04`
- `office=本社`
- `state=zero|short|met|exempt`
- `q=<employee name or number>`
- `page_size=50`
- `cursor=<opaque>`

Minimum response summary:

- target_driver_count
- met_count
- short_count
- zero_count
- exempt_count
- required_report_total
- submitted_report_total

Each employee row includes:

- employee_id
- employee_no snapshot
- employee_name snapshot
- office snapshot
- department snapshot
- target_count
- submitted_count
- remaining_count
- compliance_state

The monthly target population must be snapshotted for the month so a later transfer or retirement does not rewrite a closed month's result. Any exception for a mid-month hire, leave or other case must be explicit and auditable; the API must not silently infer or erase a target.

### POST /api/v1/near-misses

On creation, the server resolves the authenticated/selected employee and writes immutable reporting snapshots including employee number, office and department at report time. Client-supplied organization snapshots are not trusted.

Near-miss compliance counts use the report/submission date, while safety-event analysis may continue to use the occurrence date. These two dates must remain separate.
