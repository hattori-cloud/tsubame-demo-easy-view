# V200 本番稼働準備チェックリスト

更新日: 2026-09-25

## 目的

コード監査合格と本番稼働可否を分離し、本番を「設定したつもり」で開かないための最終確認表です。

コード監査固定点:
`5bd164f4ea9d1c94d62c2abf7a5aa8f7fa51c5b6`

この文書は監査固定点のコードを変更しません。

## A. コード・CI

- [ ] 固定SHAのGitHub Actionsがsuccess
- [ ] Node regressionが0 fail
- [ ] PostgreSQL 16空DB適用success
- [ ] optimistic concurrency success / VERSION_CONFLICT確認
- [ ] pg_dump → pg_restore success
- [ ] external-audit regression success
- [ ] Vercel exact SHA preview READY
- [ ] Vercel runtime errors 0

現固定点の実績:
- 296 / 296 pass
- exact SHA preview READY
- runtime error 0

## B. 本番環境変数

本番値そのものをこの文書・GitHub・監査ログへ書かない。

必要設定:
- [ ] DATABASE_URL または TSUBAME_DATABASE_URL
- [ ] TSUBAME_SESSION_SECRET（32文字以上）
- [ ] TSUBAME_MFA_ENCRYPTION_KEY（base64復号後32 byte）
- [ ] BLOB_READ_WRITE_TOKEN または TSUBAME_DOCUMENT_STORAGE_TOKEN
- [ ] TSUBAME_ENABLE_PRODUCTION_BUSINESS_DATA は最終切替まで未設定/0

禁止:
- [ ] TSUBAME_ENABLE_STAGING_FIXTURES をproductionで有効にしない
- [ ] secretをPR本文・issue・Slack等へ貼らない
- [ ] DB superuserをアプリ常用roleにしない

## C. DB

適用順:
1. docs/production-schema.sql
2. docs/production-capacity-v189.sql

- [ ] 本番DBは空DBまたは承認済みmigration経路
- [ ] schema適用error 0
- [ ] append-only audit/history guard有効
- [ ] near_miss_monthly_compliance view有効
- [ ] production app roleはleast privilege
- [ ] migration用roleとruntime roleを分離
- [ ] backup取得確認
- [ ] restore先は別DB
- [ ] restore後件数/制約/参照整合を確認

## D. 認証

- [ ] 本人ID + 社員番号 + password
- [ ] 管理者MFA
- [ ] last full administrator保護
- [ ] password reset/change後の旧credential race再現不可
- [ ] suspended / retired user拒否
- [ ] stale MFA challenge拒否
- [ ] session revoke動作確認
- [ ] shared network-source distributed rate limiter実装

## E. 原本ストレージ

productionBusinessDataEnabled() は現コードでは原本アダプター未完成のためfalseになる。

- [ ] private object storage
- [ ] quarantine
- [ ] actual MIME / size検査
- [ ] SHA-256
- [ ] malware scan
- [ ] finalize
- [ ] signed/private short-lived download
- [ ] strict document + MFA
- [ ] replacement version保持
- [ ] two-person purge
- [ ] object backup
- [ ] restore + SHA-256照合

上記が未完了ならproduction business APIを開かない。

## F. 移行

- [ ] 社員総数
- [ ] 在籍/休職/退職予定/退職件数
- [ ] immutable employee UUID割当
- [ ] current employee number
- [ ] old employee number history
- [ ] office
- [ ] department
- [ ] user/account link
- [ ] qualification/document link
- [ ] vehicle assignment
- [ ] accident / complaint / near-miss link
- [ ] reference orphan 0
- [ ] duplicate current employee number 0

詳細は migration-reconciliation-runbook-v200.md。

## G. UAT

- [ ] PC desktop
- [ ] 390px
- [ ] 320px
- [ ] iPhone
- [ ] Android
- [ ] VPN
- [ ] 2管理者同時編集
- [ ] stale browser tab
- [ ] logout / session expiry
- [ ] MFA
- [ ] retired employee
- [ ] employee renumber
- [ ] out-of-scope user
- [ ] backup/restore後ログイン

詳細は uat-runbook-v200.md。

## H. 本番切替直前

- [ ] CODEX最終再監査 Critical 0
- [ ] CODEX最終再監査 High 0
- [ ] Mediumは受入可否を明文化
- [ ] 本番DB snapshot/backup
- [ ] rollback責任者
- [ ] cutover責任者
- [ ] 緊急連絡経路
- [ ] production readiness endpoint確認
- [ ] TSUBAME_ENABLE_PRODUCTION_BUSINESS_DATA=1 は最後に設定
- [ ] 設定後health / auth / DB / major API smoke test
- [ ] 問題時は即activation flagを戻す

## I. 本番開始判定

次のいずれかが未完了ならGOにしない:
- 原本実アダプター
- distributed login rate limiter
- migration reconciliation
- 実機UAT
- restore test
- least-privilege DB role
- CODEX Critical/High解消

判定:
- GO
- CONDITIONAL GO
- NO-GO

判定理由、担当者、日時を必ず記録する。
