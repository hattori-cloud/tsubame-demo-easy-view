# Production Original Document Storage Security — v200

## Purpose

This document fixes the security requirements for production original-document files before any real employee document is uploaded.

The shared V200 demo remains metadata-only. Real PDF/image/scan originals must stay disabled until production authentication, server-side authorization, database persistence, append-only audit logging, backup/restore and private object storage are connected and tested together.

## 1. Fail-closed rule

Original-file storage must not be enabled independently.

Production file upload/download is enabled only when all of the following are available in staging and production:

1. individual authentication,
2. company user allow-list validation,
3. server-side role and office × department authorization,
4. MFA for management accounts and strict documents,
5. production PostgreSQL document metadata,
6. private object storage,
7. quarantine + malware scanning,
8. SHA-256 integrity recording,
9. append-only audit logging,
10. encrypted backup in a separate failure domain,
11. successful restore test,
12. two-person approval for physical purge.

If any dependency fails, document metadata may remain readable according to permission, but original upload/download must fail closed.

## 2. Storage model

- Object storage is private by default.
- No permanent public URL is stored in the browser or database.
- Storage keys are random opaque identifiers.
- Employee name, employee number and original file name must not appear in the storage key.
- The database stores metadata only: document id, employee id, security/access classification, storage key/version, content type, size, SHA-256, malware status, upload actor/time and lifecycle state.
- The original user file name may be retained as display metadata only after sanitization; it is not used as an object key.
- Strict documents remain full-administrator only and require MFA-confirmed access.

## 3. Upload flow

1. Browser requests an upload ticket from the API.
2. API authenticates the individual user.
3. API resolves the user against the active company user registry.
4. API checks the target employee, current office × department scope and document category.
5. Strict categories additionally require full-administrator role and MFA.
6. API issues a short-lived upload authorization bound to:
   - user,
   - employee,
   - category,
   - expected MIME type,
   - configured maximum size,
   - random quarantine storage key,
   - short expiry.
7. File is uploaded to a private quarantine location.
8. Server reads the stored bytes, verifies actual object size/type and computes SHA-256.
9. A quarantine DB row is created with `malware_scan_status=pending` before the scanner verdict is trusted.
10. Malware scan runs against the exact bytes bound to that SHA-256.
11. `clean` is recorded first; only then can the object become `active`.
12. `blocked` becomes durable `storage_state=blocked`; `error` remains quarantined for investigation/retry.
13. Pending/blocked/error files cannot be downloaded through the normal document API.
14. Scan, activation and access decisions are written to append-only audit/history.

A failed finalize must never create a normal active document row. It may retain a quarantine/blocked security record so the failed object and its SHA-256 remain auditable.

## 4. Download/view flow

1. User requests access to a document id, never to a raw storage key.
2. Server authenticates and re-evaluates authorization every time.
3. Server checks:
   - user active,
   - target employee scope,
   - document access level,
   - document not blocked,
   - malware status clean,
   - lifecycle/archived rule,
   - MFA for strict documents.
4. Server records the access decision with request id.
5. Server returns only a short-lived access authorization (target 60 seconds unless changed by approved configuration).
6. Browser does not persist the signed/private URL.
7. View/download attempt and result are written to audit logs.

Direct guessing of an object URL or storage key must not bypass API authorization.

## 5. Replacement

- Replacement always creates a new document/version record.
- Old metadata and old object remain linked for authorized history review.
- The old version is marked replaced, not hard-deleted.
- Replacement requires the same upload quarantine/scan/hash process as a new document.
- The link between old and new versions is written atomically with audit/history where supported.

## 6. Retention and purge

Retention expiry never automatically deletes a file.

At retention review:
- an authorized full administrator records the review note,
- the next approved retention date may be set,
- the file remains intact unless a separate purge process is approved.

Physical purge:
1. full administrator creates a purge request with reason,
2. a different authorized full administrator approves or rejects it,
3. requester and approver must not be the same person,
4. purge is executed only after approval and only when policy allows,
5. storage deletion result and metadata transition are audited,
6. a tombstone/history record remains after physical object deletion,
7. bulk purge without per-policy evidence is prohibited.

## 7. Malware and content validation

Before activation:
- reject disallowed content types,
- validate extension against detected/declared type where feasible,
- enforce configured size limits,
- record SHA-256,
- quarantine until scan result is clean,
- block download when scan is pending, blocked or errored,
- never trust client-provided scan status/hash as authoritative.

## 8. Backup and restore

Backup is not considered complete merely because a provider reports that backups exist.

The company must periodically restore into staging and verify:
- document row count,
- document-to-employee references,
- storage key existence,
- restored object size,
- SHA-256 match,
- replacement links,
- permission enforcement,
- strict-document MFA path,
- audit trail availability.

DB and object backups must not share a single failure domain.

## 9. Audit events

At minimum, server audit events include:

- document_upload_ticket_issued / denied
- document_upload_received
- document_malware_clean / document_malware_blocked / document_malware_error
- document_finalized
- document_view_authorized / denied
- document_download_authorized / denied
- document_verified
- document_replaced
- document_archived
- document_retention_reviewed
- document_purge_requested
- document_purge_approved / rejected
- document_purge_executed / failed
- document_restore_tested

Logs must record actor, document id, employee id when applicable, request id, result and timestamp. Secrets, raw signed URLs and full file contents must never be stored in logs.

## 10. Production acceptance criteria

Production original-file storage remains a blocking gate until staging proves all of the following:

- out-of-scope user cannot obtain an upload/download authorization,
- suspended/unregistered user is rejected,
- strict document access fails without MFA,
- quarantine objects cannot be viewed,
- blocked/error malware states cannot be viewed,
- activated objects have recorded SHA-256 and metadata,
- storage keys reveal no employee identity/original filename,
- signed/private access expires as configured,
- every view/download/replace/archive/purge action produces an audit event,
- replacement preserves the old version,
- retention expiry causes review rather than automatic deletion,
- physical purge requires a different approver,
- staging restore reproduces the expected metadata/object set with matching hashes.

## 11. Provider selection

Provider choice is intentionally deferred until contract, cost, data-location, backup/restore and operational requirements are approved.

A private object-storage product such as Vercel Blob private or an S3-compatible private store may be evaluated, but no provider is accepted solely because it can store private objects. It must satisfy the full acceptance criteria above.


## 12. Scanner adapter contract

Production scanning is deliberately separate from object storage.

The supported production scanner contract requires:

- provider name `private-https`,
- explicit company approval flag,
- HTTPS endpoint,
- secret token of approved strength,
- bounded request timeout,
- redirects disabled,
- no browser/client access to scanner credentials.

The scanner receives only file bytes, MIME type, SHA-256 and request id. Employee identity and original filename are excluded.

The response must contain:
- verdict: `clean` or `blocked`,
- the same SHA-256,
- optional engine/signature metadata.

Any timeout, HTTP failure, invalid response or hash mismatch is stored/treated as `error` and cannot activate the original.

## 13. Live readiness probes

The production readiness command must not trust environment-variable presence alone.

Before activation it verifies:

- PostgreSQL connection/schema/audit/capacity/rate-limit/work-import/runtime-role state,
- private Blob signing can actually issue a short-lived authorization,
- the approved scanner can actually scan a fixed synthetic, non-employee PDF and return `clean` with the same SHA-256.

The live scanner probe never uses an employee document.


## 14. Secondary backup adapter contract

Production business activation now requires a separate original-document backup readiness gate in addition to primary private storage and malware scanning.

The production backup contract requires:

- provider `private-https`,
- explicit company approval,
- explicit confirmation that the destination is in a separate failure domain,
- HTTPS endpoint with no embedded credentials, query string or fragment,
- a dedicated backup authorization token,
- a dedicated 32-byte backup encryption master key.

Original bytes are encrypted with AES-256-GCM before leaving the application backup process. The backup object key is an HMAC-derived opaque identifier and does not expose the primary storage key, employee identity or original filename.

Each encrypted backup envelope binds authenticated metadata for:
- content type,
- byte size,
- source SHA-256.

A restore is accepted only when:
- AES-GCM authentication succeeds,
- restored byte size matches,
- restored SHA-256 matches,
- restored magic bytes match the declared PDF/JPEG/PNG content type.

The backup transport uses a fixed HTTPS endpoint and passes the opaque backup key in a header. Secrets are not placed in the URL.

The source backup job selects only active, malware-clean, non-archived originals. Before writing a secondary copy, it reads the primary object and compares MIME, size and SHA-256 with the database row. Any mismatch aborts the backup run.

## 15. Backup live readiness

Production readiness does not treat backup environment variables as sufficient.

The live backup probe:
1. creates a synthetic non-employee PDF,
2. encrypts it,
3. writes it to the approved secondary provider,
4. reads it back,
5. authenticates/decrypts it,
6. verifies MIME, size and SHA-256,
7. removes the synthetic probe object.

If the secondary provider is unavailable, restore verification fails, or the object cannot be removed after the probe, production readiness must not be considered complete. Real employee originals are never used by the live readiness probe.
