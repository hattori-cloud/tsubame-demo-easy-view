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
- production schema: 22 tables / 48 indexes / duplicate 0
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
