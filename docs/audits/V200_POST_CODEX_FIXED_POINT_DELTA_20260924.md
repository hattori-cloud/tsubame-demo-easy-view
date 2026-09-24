# V200 CODEX監査固定点以降のstaging差分台帳

更新日: 2026-09-24

## 監査固定点

CODEXが監査する固定ソース:
`e69d406b56cfe79a7469a3ed5bb245e7d753d1f6`

この固定点は変更しません。

現在のstagingは固定点より **26 commits ahead** です。
CODEX最終報告を受け取ったら、各指摘をこの台帳と突き合わせて「監査後に修正済み / 未修正 / 別問題 / 誤検知」に分類します。

## 固定点以降の主要な実装修正

### 1. 苦情の変更検知

- commit: `27ed8a2b1f2a31929cd7051aa2d4d078c2c3d056`
- 「指導内容」だけの編集が変更なし扱いになる問題を修正。
- 対応時間、対応者、お客様名、発生日/時間、指導者、指導日/時間、担当者ID等も変更比較へ追加。
- regression: `065fab0f92319484e5a0de6b1c7956637a741f59`

### 2. stale/recovery-required状態でのフォーム先行変更防止

- commit: `ef1bf9c311cb44968a204a25f31c4bd0a6f5cfd1`
- form save capture段階で `coreSaveRevisionIsCurrent()` を先に確認。
- 別タブ更新検知済み、またはrecovery-required中は各フォームのmutation handlerを実行しない。
- regression: `28c3146b4d6e17fc792e7d296e3c74fcce547b47`

### 3. フォーム外の直接更新ガード

- commit: `bebf675b1b46c35dfac1843b3b1be22272186307`
- 対象:
  - 掲示既読
  - 一斉確認回答
  - 申請承認/差戻し
  - 引継ぎ確認
  - 原本確認
  - 書類無効化
  - 対応メモ追記
  - 安全指導完了
  - 通知設定
- `coreMutationReady()` でmutation前に保存可能状態を確認。
- regression: `581ba0ab5ed01af5a3d8d0ffa8d21d0c20fc8931`
- future guard detector: `723fb2d0c0584a02e0740033375f57c7748bd6b2`

### 4. production schemaの監査ログ追記専用化

- commit: `90cb60dafa26369cbb540bd7ccdac80a8c3b3917`
- `audit_logs` と `record_histories` の UPDATE / DELETE をPostgreSQL triggerで拒否。
- regression: `b418e0e2c7f6b71b4aef0446a2483a2d586a4e08`
- API contract整合: `13e4782fdc5bd05fb65ee1765484ceb81cf0aad2`
- SQL受入条件更新: `dc686c03916e34bb149397539d62b53caf627bac`

### 5. 容量追加SQLの重複index整理

- `5173bd6e5ae90fb5cdfdb532e54b4d90b925b129`
- `df544c37b1a0812087e73ef5731499f25fbee4d8`
- V200基準schemaに既にある同一検索経路のindexをcapacity addendumから削除。
- regression: `0fd27e8fcbf91aa74a148676df9e1cca4bd61c6d`
- combined schema check: `b47f8f5febf3f32edcb89f142c17109cfc7c0bec`

## 固定点以降に追加した主要な安全テスト

- UI/API V200 release consistency
- top-level constant initialization order
- production index undefined-column rejection
- static DOM duplicate id rejection
- undefined onclick target rejection
- capacity/base index duplicate rejection
- combined base + capacity schema column validation
- complaint editable-field change detection
- pre-mutation stale-state form guard
- direct mutation stale-state guard
- future direct save action guard
- append-only audit/history DB enforcement

## PostgreSQL実適用

適用順序:
1. `docs/production-schema.sql`
2. `docs/production-capacity-v189.sql`

詳細:
`docs/production-sql-apply-order-v200.md`

CODEXの空DB実適用結果では、以下を固定点監査結果とは別に確認すること:
- SQL error 0
- audit_logs / record_histories UPDATE拒否
- audit_logs / record_histories DELETE拒否
- near_miss_monthly_compliance zero / short / met / exempt
- duplicate indexなし
- 実社員データ未使用

## Vercel preview注意

GitHub stagingが進んでも、Vercel previewが同じcommitまで追従しているとは限りません。
実画面確認時は必ずdeployment metadataの `githubCommitSha` と対象commitを照合してください。

2026-09-24確認時点ではpreviewが一時的に `ef1bf9c...` までで、GitHub stagingより遅れている状態を確認しています。

## CODEX最終報告受領時の分類

各指摘を以下のいずれかへ分類する:

1. 固定点にも存在し、現在stagingでも未修正
2. 固定点には存在したが、上記後続commitで修正済み
3. 固定点にはなく、監査中または後続変更で新規発生
4. 既知の本番未接続条件
5. 誤検知 / 再現不可

「2」は同じ修正を重複して入れず、回帰テストだけ照合する。
