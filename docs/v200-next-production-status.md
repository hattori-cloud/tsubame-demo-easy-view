# V200 Next Production — 9割到達管理表

更新日: 2026-09-26

基準:
- 監査固定版: `5bd164f4ea9d1c94d62c2abf7a5aa8f7fa51c5b6`
- 次期本番準備: `staging-v200-next-production`

## 目的

CODEX監査中の固定版を変更せず、次期本番準備ブランチで残ブロッカーを先行解消する。

## 実装済み・自動実証済み

### 認証・権限
- ID + 社員番号 + password
- 管理者MFA
- password reset/change credential race防止
- last full administrator保護
- retired/suspended session拒否
- distributed PostgreSQL login rate limiter
- network source + source/login bucket
- limiter store障害時fail-closed
- least-privilege runtime DB role
- runtime DDL拒否
- audit/history UPDATE/DELETE拒否

### DB
- 本番候補schema実適用
- optimistic concurrency
- append-only audit/history
- pg_dump → pg_restore
- restored DB再検証
- migration reconciliation自動検査

### 勤務取込
- Excel前チェック
- 1900 / 1904 date system
- SHA-256照合
- transactional commit
- current / old employee number解決
- import history
- duplicate file commit拒否
- safe rollback
- 後続変更がある場合rollback拒否
- rollback audit/history

### 原本
- private Blob adapter
- random quarantine key
- signed private PUT
- MIME / max size制約
- DB-bound upload ticket
- employee / qualification / policy binding
- paper location / retention binding
- private short-lived GET
- active + cleanのみdownload
- malware scanner adapter境界
- scanner URL/secret/audited flag readiness
- scanner SHA-256 / MIME / size再照合
- blocked file拒否設計
- clean finalize transaction
- upload ticket single-use
- policy変更後の古いticket拒否
- production activationはscanner未接続時fail-closed

### 本番UI
- localStorageデモと分離
- same-origin API client
- cookie session
- login
- MFA初回登録
- MFA verify
- logout
- employee list/detail/create/update
- deadlines
- accident list/create/update/complete/reopen
- complaint list/detail/create/update/complete/reopen
- vehicle list/create/update
- If-Match/version更新
- self userの管理者メニュー非表示
- responsive CSS 780 / 390 / 320
- Vercel production UI route
- demo fallbackとのroute順固定

## 現在の主要残件

### 実環境接続
- real production PostgreSQL
- real auth secrets
- real MFA encryption key
- Vercel Private Blob store
- approved malware scanner service
- production app role適用
- actual rate limiter secret
- actual production activation gate

### 本番UI未接続
- qualifications / document metadata
- original document upload/finalize/download UI
- near-miss
- guidance
- applications
- notices/confirmations
- handoffs
- user/role administration
- work-import production screen/history/rollback
- safety analysis full production screen

### UAT
- PC実ブラウザ
- 390px実ブラウザ
- 320px実ブラウザ
- iPhone
- Android
- VPN
- multi-device
- stale tab
- real signed upload/download

### 移行
- actual source export
- real employee migration rehearsal
- source/destination件数照合
- actual orphan/reference reconciliation

## 9割判定の考え方

コード・DB/API基盤:
- 90%超を目標
- 自動試験で裏付ける

本番UI:
- 主要業務をAPIへ移行後に90%判定

実環境:
- secrets / DB / storage / scanner / UATがない間は90%とは扱わない

## 次の優先順

1. 原本finalize実DB回帰を全CIで緑化
2. 本番UIへ資格・書類・ヒヤリ・勤務取込を接続
3. user/role administration画面接続
4. safety analysisをproduction APIへ接続
5. actual Vercel Private Blob staging接続
6. approved scanner staging接続
7. migration rehearsal
8. PC/mobile/multi-device UAT
9. CODEX再監査
10. production GO/NO-GO

## 禁止

- 監査固定SHAへの次期機能の混入
- scanner未接続でproduction activation
- 実社員情報のpreview投入
- 実原本のscanner未接続環境への投入
