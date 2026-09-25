# V200 staging 現在地

更新日: 2026-09-25

## 監査固定点

CODEX再監査対象ソース:
`e69d406b56cfe79a7469a3ed5bb245e7d753d1f6`

この固定点は動かさない。以後の資料・テスト追加は別コミットで行う。

## 現在確認済み

- JavaScript構文回帰テストあり
- recovery-required初期化順序回帰テストあり
- 勤務Excel [h]:mm テストあり
- 明示不正対象月の拒否テストあり
- production schema: 28 tables / 48 indexes / duplicate 0
- document SHA-256 / malware lifecycle schema定義あり
- V200 UI/API release consistency testあり
- staging employees API: anonymous requestを401拒否
- staging readiness: 認証 / fixtures / DB / private storage の未接続を明示
- real employee dataは未投入

## 本番移行ブロッカー

- production URLのAPI releaseと監査済みV200の一致確認
- 実認証
- MFA
- active company user registry
- server-side authorization
- PostgreSQL空DB実適用
- migration reconciliation
- append-only audit storage
- private original-document storage
- quarantine / malware scan / SHA-256
- backup / restore exercise
- multi-user concurrency
- PC / 390px / 320px browser UAT
- VPN / 複数端末実機UAT

## 運用判断

共有デモ・架空データ検証: 継続可。

実社員情報の本番投入: 不可。上記ブロッカー完了後に再判定。

実PDF・画像・スキャン原本投入: 不可。private storage + auth + server authorization + audit + restore test完了までfail-closed。

## index.html対策

全面リファクタリングはしない。
`docs/index-split-plan-v200.md` に従い、純粋関数 → 保存 → 権限 → 業務領域 → 分析 → boot の順で段階分割する。


## 2026-09-24 追加強化後の現在地

CODEX再監査用に以前固定した `e69d406b56cfe79a7469a3ed5bb245e7d753d1f6` は、監査証跡としてそのまま残します。

その後の staging では次を追加しています。

- 苦情「指導内容」単独編集を含む全編集項目の変更検知
- 保存拒否・保存失敗時のメモリ状態ロールバック
- 別タブ監査ログ統合
- SQL未定義列・重複DOM ID・未定義onclick・初期化順序のCI検査
- V200 UI/API release整合テスト
- capacity SQLの重複列・重複インデックス整理
- 事故・苦情・ヒヤリの記録時所属スナップショット
- 安全分析の高危険比率 / 未完了比率 / 事故1件平均修理費 / 分析項目充足率
- 部署別「100人在籍あたり参考比」（真の発生率ではない旨を明記）
- 完全 / 一部 / 現在所属代用のスナップショット品質表示
- 前年同期・部署比較・フィルター候補も記録時所属優先
- 資格・貸与品・安全指導・面談・書類の無変更保存を抑止

現時点の機能コード＋回帰テスト候補コミット:
`97a55a04f130de750372e3d04158e3ac21821274`

GitHub Actions:
**164 tests / 164 pass / 0 fail**

次回CODEXへ最終監査を依頼する際は、旧固定コミットではなく、最終作業完了後に改めて固定した最新コミットを指定します。


## 2026-09-25 本番基盤9割候補の実証結果

開発・CI上の最新監査候補コード固定点:
`c27567900713b58e29abcf2a703d27357a3a7a0a`

この固定点では、従来の静的監査に加えて実PostgreSQL・同時更新・バックアップ復元・Vercel配備まで確認しました。

### GitHub Actions 実績

- Node回帰テスト: **268 tests / 268 pass / 0 fail**
- PostgreSQL 16 の空DBへ `production-schema.sql` → `production-capacity-v189.sql` を実適用
- 基準スキーマ: **28 tables**
- 容量追加後: **29 tables**
- `audit_logs` / `record_histories` UPDATE・DELETE拒否を実DBで確認
- 構造重複index: **0**
- 月次ヒヤリ: `zero / short / met / exempt` を実DBで確認
- 同一社員への同時更新: **1件だけ成功 / 1件は 409 VERSION_CONFLICT 相当で拒否**
- version増加: **+1のみ**
- 更新履歴: **1行のみ**
- `pg_dump` → 別DB `pg_restore` 実施
- 復元後も29 tables・月次ヒヤリ状態・append-only監査保護を再確認
- 全DB実試験は `CI9001` 等の明示的な架空データのみ。実社員データ不使用

### 実DB試験で発見・修正した問題

1. PL/pgSQL append-only trigger関数の区切りが実PostgreSQLでは構文エラーになる問題を発見し修正。
2. 社員更新時、`record_histories.entity_id(text)` と `employee_id(uuid)` に同じ未型指定パラメータを使い、PostgreSQLで `text versus uuid` になる問題を発見。
3. 社員登録・更新・社員番号変更・異動/退職の監査SQLを UUID / text 明示型へ統一。
4. canonical schemaが後続機能追加で22→28 tablesへ増えていたのに、古い受入条件が22のままだったため現行構成へ同期。

### Vercel staging

- Hobbyプランの12 Serverless Functions上限に対し、70本のv1業務ハンドラを内部モジュールとして保持したまま、Vercel入口を単一API routerへ集約。
- 動的ルート `[employeeId]` / `[id]` 衝突を `[id]` へ統一。
- 最新監査候補 `c275679...` のVercel preview: **READY**
- Vercel buildは **Node 22.x** 固定で完了。
- 実行環境からpreview URLへの直接ブラウザ到達はできなかったため、PC / 390px / 320px の実ブラウザUATは引き続き未完了。

## 本番移行ブロッカーの再分類

### 開発・CIで解消済み

- PostgreSQL空DB実適用
- append-only audit/history DB保護
- DBバックアップ / 別DB復元演習
- 社員更新のmulti-user optimistic concurrency
- Vercel Serverless Functions数上限
- Vercel動的APIルート衝突
- Node実行メジャーバージョン固定
- 退職時の利用者停止 / セッション失効 / 保留MFA・パスワード再設定無効化
- 退職直前の古い認証処理から新規セッションを発行できる競合対策

### 実環境で未完了

- production URLを最新監査固定点へ昇格し、release一致を最終確認
- 実会社利用者によるログインID + 社員番号 + パスワード認証の受入試験
- 実MFA登録・再認証運用
- active company user registry の実データ照合
- 本番PostgreSQL接続・最小権限DBロール・migration reconciliation
- private original-document storage の実接続
- quarantine / MIME / size / SHA-256 / malware scan / clean後有効化の実アダプター
- 原本DB + object storage の別障害領域バックアップ / 復元 / SHA-256照合
- PC / 390px / 320px browser UAT
- VPN / 複数端末 / 複数利用者の実機UAT
- 実社員データ移行前の件数・参照整合・社員番号履歴照合

## 現時点の運用判断

**本番基盤のコード・DB/API設計は「9割監査候補」として大監査へ進める状態。**

ただし、これは「実社員データを今すぐ投入してよい」という意味ではありません。
実認証、本番DB、private原本ストレージ、実機UAT、migration reconciliation が未完了のため、実社員情報・実PDF/画像/スキャン原本の投入は引き続き禁止です。


## 2026-09-25 最終監査固定点更新

最終コード監査固定点:
`c1e5b43442ce8f92a737df64c75038961a525740`

この固定点は、旧候補 `c275679...` 以降の認証・退職連動・本番有効化ゲート強化を含みます。

追加確認済み:
- Node回帰テスト: **276 / 276 pass / 0 fail**
- PostgreSQL 16 本番候補schema実適用: 成功
- multi-user optimistic concurrency: 1成功 / 1 VERSION_CONFLICT
- pg_dump → 別DB pg_restore → 復元後検証: 成功
- 復元後29 tables、月次ヒヤリ zero / short / met / exempt、append-only保護維持
- Vercel単一router構成: READY
- Vercel runtime errors（直近確認範囲）: 0
- production業務APIは `TSUBAME_ENABLE_PRODUCTION_BUSINESS_DATA=1` の明示指定に加え、認証/DB readiness成立時だけ有効化
- 明示有効化前はhealth以外をrouter入口で503拒否

実Vercel staging readiness（2026-09-25確認）:
- 認証設定: 未接続
- staging DB接続設定: 未接続
- private原本ストレージ: 未接続
- secure-probe: AUTH_NOT_CONFIGURED で503（意図どおりfail-closed）

したがって、**コード・DB/API設計は9割監査候補**ですが、実環境の本番稼働準備は別ゲートです。
実社員情報・実PDF/画像/スキャン原本は、実認証・本番DB・private storage・実機UAT・移行照合が完了するまで投入禁止を継続します。
