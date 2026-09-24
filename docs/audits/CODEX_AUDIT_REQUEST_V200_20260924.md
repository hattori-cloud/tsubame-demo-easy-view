# CODEX監査依頼 — つばめ交通 社員一元管理システム V200 staging

監査日: 2026-09-24

## 固定監査対象

- Repository: `hattori-cloud/tsubame-demo-easy-view`
- Branch: `staging-v200-backend`
- **Source commit: `e69d406b56cfe79a7469a3ed5bb245e7d753d1f6`**

この固定コミットを変更せず隔離して監査してください。mainやproduction URLの別コミットを混ぜず、監査前後で対象ファイルのSHA-256を照合してください。実社員情報・実社員書類・実認証情報は使用せず、架空データのみ使用してください。

## V197 CODEX指摘からの修正点

1. 起動TDZ: `CORE_RECOVERY_REQUIRED_KEY` を宣言前に評価する経路を除去し、回帰テストを追加。
2. Excel `[h]:mm`: ExcelJSがDateを返す場合も時間数へ変換。
3. 不正対象月: 空欄のみ最終計上日から補完し、非空欄の不正値はblocking issue。
4. 過去月ヒヤリ: 文字列表現依存を減らした回帰確認。
5. Production schema: SHA-256 CHECKを修復し、`malware_scan_status` / `malware_scanned_at` を定義。clean baselineから再構築。

最終GitHub Actions run #102: **121 tests / 121 pass / 0 fail**。

## 最優先監査

- PC 1366px / 390px / 320pxでruntime exception 0、社員一覧初期化、主要画面遷移。
- full/scoped/selfで担当外データへの直接関数呼出し・リンク遷移・詳細遷移。
- 保存前snapshot → write → verify → rollback → recovery-required。
- rollback失敗後の保存停止、backup正常復元後の解除、別タブ競合、reload。
- 事故/苦情/ヒヤリ/社員/車両/資格/書類の保存・戻る・再表示。
- 月次事故/ヒヤリ遷移の古いfilter解除、全期間高危険の月解除。
- 過去月ヒヤリ月2件対象者のsnapshot固定。
- 実XLSXで0h / 60:00 / 60:30 / 240:00 / 空欄 / 不正日付 / 不正明示月。
- `docs/production-schema.sql` を空PostgreSQLへ実適用。
- 原本管理のfail-closed設計とAPI/DB/UIの整合。
- 分析画面の期間/事業所/部署/雇用区分/社員フィルター引継ぎと件数整合。

## Productionとの差

現時点で `https://tsubame-demo-easy-view.vercel.app/api/v1/health` は `release:v129` を返します。V200 staging APIとは一致していません。これはstagingのアプリ不具合と混同せず、**production deploy drift / 本番移行ブロッカー**として別項目にしてください。

## 本番移行停止条件

実社員データ投入前に少なくとも以下が必要です。

- 実認証 + MFA + active company user registry
- 全業務APIのserver-side authorization
- PostgreSQL実適用・移行・競合試験
- append-only server audit
- private original storage + quarantine + malware + SHA-256
- backup/restore実地試験
- production URLと監査済みcommit/API releaseの一致
- full/scoped/self browser UAT
- PC/スマホ/複数端末/VPN実機UAT
- 実社員データ投入前照合

## 報告形式

各指摘に ID / Severity / 対象ファイル・行 / 再現手順 / 実結果 / 期待結果 / 原因 / 最小修正案 / 新規回帰・未解消・既知制約・誤検知の区分 / 証拠を付けてください。

最後に、テスト総数、確認viewport/role、PostgreSQL実適用結果、監査前後SHA-256一致、本番移行可否と停止条件をまとめてください。

全面リファクタリングより、まず重大度付き監査を優先してください。
