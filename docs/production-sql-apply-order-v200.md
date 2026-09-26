# V200 本番DBスキーマ適用順序

更新日: 2026-09-24

## 目的

空のstaging PostgreSQLで、本番候補スキーマを安全に検証するための適用順序を固定します。
実社員データは投入しません。

## 適用順序

1. `docs/production-schema.sql`
2. `docs/production-selected-user-workflow-v200.sql`
3. `docs/production-selected-user-account-retirement-v200.sql`
4. `docs/production-auth-hardening-v200.sql`
5. `docs/production-capacity-v189.sql`
6. `docs/production-work-import-v200.sql`
7. `docs/production-role-grants-v200.sql`

順番を逆にしないでください。

基準スキーマは社員、利用者、事故、ヒヤリ、苦情、資格、書類、監査等の本体テーブルを作成します。
指定利用者workflow SQLは、旧 `notices_workflow` 権限を管理者間の `handoffs` 権限へ安全に移し、掲示・一斉確認・本人申請を本番対象から分離します。
旧self利用者停止SQLは、既存の旧一般社員アカウントを削除せず、セッション失効・権限解除・停止済みscoped利用者への変換を行い、監査参照用のuser IDを保持します。
認証強化SQLは、全Vercel/serverless instanceで共有するログイン試行制限テーブルを追加します。
容量追加SQLは、月次ヒヤリ対象者スナップショットと大容量運用向け索引・ビューを追加します。

## 空DB試験の必須確認

### 基準スキーマ適用後

- transaction完了
- 28テーブル
- index作成成功
- foreign key作成成功
- documents.content_sha256 CHECK作成成功
- malware_scan_status / malware_scanned_at列あり
- document_purge_requests作成成功
- audit_logs / record_histories の UPDATE・DELETE がDBトリガーで拒否される

### 認証強化SQL適用後

- login_rate_limits作成成功
- key_hashはSHA-256/HMACの64桁hexのみ
- source / source_loginの2種のみ
- blocked_until / updated_at索引作成成功
- 基準28テーブル + limiter 1テーブル = 29テーブル

### 容量追加SQL適用後

- near_miss_monthly_targets作成成功
- near_miss_monthly_compliance view作成成功
- 既存列への ALTER TABLE IF NOT EXISTS が失敗しない
- 既存基準スキーマと同名・同一構成の不要indexを重複作成しない
- 月次対象者 unique(month_start, employee_id) が有効

### 勤務集計永続化SQL適用後

- work_import_batches作成成功
- work_import_rows作成成功
- work_summary_monthly作成成功
- employee_id × month_start unique有効
- 元Excelファイル本体をDB保存しない
- 基準28 + limiter1 + capacity1 + work-import3 = 33テーブル

### DB権限分離SQL適用後

- tsubame_migrator / tsubame_app_runtime がNOLOGIN
- runtime roleはDDL不可
- runtime roleはemployees等の任意DELETE不可
- runtime roleはaudit_logs / record_histories / employee_number_historyのUPDATE/DELETE不可
- migrator roleはschema変更可能
- 実接続LOGIN roleのpassword/credentialはこのSQLに書かない

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

- 空DBに7ファイルを順番通り適用してerror 0
- schema/table/index/viewの件数確認
- 制約違反が期待どおり拒否される
- 月次ヒヤリcomplianceが zero / short / met / exempt を正しく返す
- 実社員データ未使用
