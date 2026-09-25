# V200 本番準備ドキュメント索引

更新日: 2026-09-25

コード監査固定点:
`5bd164f4ea9d1c94d62c2abf7a5aa8f7fa51c5b6`

この固定点以降の本番準備作業はdocsのみで、監査対象コードは変更していない。

## 監査

- docs/audits/V200_REREAUDIT_REQUEST_5BD164F_20260925.md
- docs/audits/V200_REAUDIT_REQUEST_2F67CA9_20260925.md
- docs/audits/V200_INTERNAL_FINAL_AUDIT_20260925.md
- docs/audits/CODEX_FINAL_AUDIT_REQUEST_V200_20260925.md

## 本番準備

- docs/production-readiness-checklist-v200.md
  - GO / NO-GOの総合チェック

- docs/migration-reconciliation-runbook-v200.md
  - 実社員データ移行・件数・参照整合

- docs/uat-runbook-v200.md
  - PC / mobile / VPN / 複数端末UAT

- docs/cutover-rollback-runbook-v200.md
  - 本番切替・即停止・ロールバック

## セキュリティ設計

- docs/production-document-storage-v200.md
  - private原本、quarantine、scan、SHA、restore

- docs/distributed-login-rate-limit-design-v200.md
  - shared network-source limiter

- docs/production-db-role-design-v200.md
  - owner / migrator / app role分離

## DB

- docs/production-sql-apply-order-v200.md
- docs/production-schema.sql
- docs/production-capacity-v189.sql

## 推奨順序

1. CODEX再々監査完了
2. production readiness checklistの未完了項目を確定
3. distributed rate limiter実装
4. private原本adapter実装
5. least-privilege DB role適用
6. staging real-environment接続
7. migration rehearsal
8. PC/mobile/multi-device UAT
9. backup/restore実環境試験
10. cutover dry-run
11. GO / NO-GO判定
12. production activation

実社員情報・実原本は、該当ゲート完了まで投入しない。
