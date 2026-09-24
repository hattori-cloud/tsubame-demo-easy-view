# V200 staging 現在地

更新日: 2026-09-24

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
