# Production API Contract Draft — v106

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
- A mismatch returns `409 Conflict`.
- The server must not silently overwrite a newer record.

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

Supports scoped search by employee, date range, phase, owner, due state and keyword.

### POST /api/v1/accidents

Scoped administrator.

The server validates the target employee is in scope.

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

Supports employee, date range, risk level, cause side and keyword.

### POST /api/v1/near-misses
### PATCH /api/v1/near-misses/{id}
### POST /api/v1/near-misses/{id}/archive

Near misses remain analysis/safety-learning records and do not require a manager-owned response workflow.

## 6. Complaints

### GET /api/v1/complaints
### POST /api/v1/complaints
### PATCH /api/v1/complaints/{id}
### POST /api/v1/complaints/{id}/complete
### POST /api/v1/complaints/{id}/reopen
### POST /api/v1/complaints/{id}/archive

Open complaints should validate owner, next action and follow-up due date.

Completion writes completion date and reviewer on the server.

## 7. Qualifications and documents

### GET /api/v1/employees/{employeeId}/credentials

Returns qualifications plus document metadata visible to the user.

### POST /api/v1/qualifications
### PATCH /api/v1/qualifications/{id}

### POST /api/v1/documents

Creates document metadata after storage upload authorization.

### PATCH /api/v1/documents/{id}

Updates metadata/status only.

### POST /api/v1/documents/{id}/replace

Creates a new document record and links the old record through `replaced_by_document_id`.

The old evidence is not hard-deleted.

### POST /api/v1/documents/upload-ticket

Returns a short-lived upload authorization only after server-side employee/document permission checks.

Files remain private by default.

### GET /api/v1/documents/{id}/download-ticket

Returns a short-lived download authorization only after permission checks.

## 8. Vehicles

### GET /api/v1/vehicles
### POST /api/v1/vehicles
### PATCH /api/v1/vehicles/{id}

Vehicle payload supports:

- plate
- call_sign
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

## 15. Out of scope

- PCA and アントレ remain planning items until their exact integration requirements are approved.
