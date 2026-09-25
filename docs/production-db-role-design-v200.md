# V200 本番PostgreSQL 権限分離設計

更新日: 2026-09-25

## 目的

アプリruntime接続ユーザーへ不要なDDL/owner権限を与えず、migrationと通常運用を分離する。

## role構成

最低:
1. tsubame_db_owner
2. tsubame_migrator
3. tsubame_app
4. backup/restore用role（必要なら別）

## tsubame_db_owner

用途:
- object owner
- 通常アプリ接続に使わない

禁止:
- Vercel runtime secretへ設定しない

## tsubame_migrator

用途:
- 承認済みmigration
- CREATE/ALTER/INDEX/TRIGGER/FUNCTION

制限:
- migration時間以外はsecret無効化/保管
- application runtimeから利用不可

## tsubame_app

用途:
- SELECT
- INSERT
- UPDATE
- 必要なtableへの限定操作

原則禁止:
- CREATE
- ALTER
- DROP
- TRUNCATE
- CREATE ROLE
- SUPERUSER
- BYPASSRLS
- audit/history UPDATE/DELETE

## audit/history

DB triggerのappend-only保護に加え、
runtime roleへUPDATE/DELETE権限を与えない。

二重防御:
- privilege
- trigger

## sequence / function

必要なsequence USAGEのみ。
security definer functionを使う場合:
- search_path固定
- public executeを剥奪
- owner限定

## schema

public schema CREATE権限をruntime roleへ与えない。

## object privileges

migration後に自動確認:
- app role has SELECT/INSERT/UPDATE on approved tables
- app role cannot ALTER table
- app role cannot DROP table
- app role cannot UPDATE audit_logs
- app role cannot DELETE record_histories

## 接続

runtime:
- DATABASE_URL / TSUBAME_DATABASE_URL = tsubame_app

migration:
- CI/CD secret = tsubame_migrator

owner credentials:
- break-glass管理
- 日常使用禁止

## backup

backup role:
- read-only
- 必要objectのみ
- secretsの保存方法を承認

restore先:
- staging/isolated DB
- productionへ直接restoreしない

## 接続pool

- max connectionsをserverless前提で設定
- idle timeout
- statement timeout
- lock timeout
- transaction timeout

## production smoke

app roleで:
- employee SELECT成功
- accident INSERT/UPDATE成功
- audit INSERT成功
- audit UPDATE失敗
- audit DELETE失敗
- schema ALTER失敗
- DROP失敗

migrator roleで:
- approved migration成功

## 緊急時

owner/migratorで手修正する前に:
- incident ID
- backup
- SQLレビュー
- 実行者/承認者
- after verification

その場のad-hoc SQLを通常運用にしない。

## 合格条件

- runtime URLがapp role
- app role非owner
- app role非superuser
- DDL不可
- audit/history改ざん不可
- restore testあり
- migration credentialがruntimeから参照不可
