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
8. Server verifies actual object size/type and computes or validates SHA-256.
9. Malware scan runs.
10. Only a clean file can be finalized into an active document record.
11. The finalization transaction writes document metadata, storage state and audit log together.
12. Pending/blocked/error files cannot be downloaded through the normal document API.

A failed finalize must not create a normal active document row pointing at an unverified object.

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
- document_scan_clean / blocked / error
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

## 11. Accident evidence integration

Accident photos, sketches, vehicle-damage images, police documents and repair estimates use the same protected document lifecycle as all other electronic originals.

- The accident record stores no file bytes and no permanent object URL.
- The relationship is stored separately through the accident-to-document link.
- Linking a document to an accident never widens its document access level.
- New accident evidence uses the normal quarantine → validation → malware scan → finalize flow.
- Finalizing an accident-evidence upload and creating the accident link must be transactional.
- Replacing evidence preserves the old version for history while the new active version becomes the report candidate.
- The browser must not persist private/signed URLs in accident records, local storage, print templates or audit logs.
- Accident report export re-authorizes the accident and every included document.
- Only active, clean, authorized evidence may be embedded in an exported report.
- A report must use a safe placeholder when an expected image is unavailable or withheld by current authorization.
- Report generation and evidence view/download are audited separately.

The shared demo remains metadata-only. Its print preview may show evidence names and placement boxes, but those are not proof that an original image was stored.

## 12. Provider selection

Provider choice is intentionally deferred until contract, cost, data-location, backup/restore and operational requirements are approved.

A private object-storage product such as Vercel Blob private or an S3-compatible private store may be evaluated, but no provider is accepted solely because it can store private objects. It must satisfy the full acceptance criteria above.
