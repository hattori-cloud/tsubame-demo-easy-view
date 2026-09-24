# V200 本番DBスキーマ適用順序

更新日: 2026-09-24

## 目的

空のstaging PostgreSQLで、本番候補スキーマを安全に検証するための適用順序を固定します。
実社員データは投入しません。

## 適用順序

1. `docs/production-schema.sql`
2. `docs/production-capacity-v189.sql`

順番を逆にしないでください。

基準スキーマは社員、利用者、事故、ヒヤリ、苦情、資格、書類、監査等の本体テーブルを作成します。
容量追加SQLは、月次ヒヤリ対象者スナップショットと大容量運用向け索引・ビューを追加します。

## 空DB試験の必須確認

### 基準スキーマ適用後

- transaction完了
- 22テーブル
- index作成成功
- foreign key作成成功
- documents.content_sha256 CHECK作成成功
- malware_scan_status / malware_scanned_at列あり
- document_purge_requests作成成功

### 容量追加SQL適用後

- near_miss_monthly_targets作成成功
- near_miss_monthly_compliance view作成成功
- 既存列への ALTER TABLE IF NOT EXISTS が失敗しない
- 既存基準スキーマと同名・同一構成の不要indexを重複作成しない
- 月次対象者 unique(month_start, employee_id) が有効

## 動作確認用の架空データ

実社員情報は禁止。
必要なら、監査専用の最小架空データだけを別トランザクションで投入し、試験後rollbackまたはDB破棄してください。

最低確認:
- employee 1件
- user 1件
- near_miss_monthly_targets 1件
- near_misses 0件 → compliance zero
- near_misses 1件 → compliance short
- near_misses 2件 → compliance met
- exempt対象 → compliance exempt

## 失敗時

SQLをその場で手修正して続行しないでください。
失敗したstatement、PostgreSQL error code、line、適用済みobjectを記録してDBを破棄し、ソース側を修正して最初から再適用します。

## 合格条件

- 空DBに2ファイルを順番通り適用してerror 0
- schema/table/index/viewの件数確認
- 制約違反が期待どおり拒否される
- 月次ヒヤリcomplianceが zero / short / met / exempt を正しく返す
- 実社員データ未使用
