# index.html 分割候補インベントリ — V200

更新日: 2026-09-24

## 方針

この文書は実際にコードを切り出す前の依存整理です。監査固定コミットは変更せず、stagingの後続コミットで段階移行します。

## Phase 1候補 — 先に切り出せる純粋関数

### recordChangeLines(before, after, labels)
- DOM依存: なし
- localStorage依存: なし
- global mutable state依存: なし
- 用途: 保存確認の変更前後表示
- 推奨先: `js/core-utils.js`
- 先行テスト: 差分なし / null / 数値・文字列差 / 配列JSON文字列

### normalizedEmployeeDate(v)
- DOM依存: なし
- localStorage依存: なし
- global mutable state依存: なし
- 用途: ヒヤリ月次対象者の過去状態判定
- 推奨先: `js/core-utils.js`
- 注意: 現在は形式だけを見る。実在日付検証とは役割を分ける

### nearQuotaReportMonth(n)
- DOM依存: なし
- localStorage依存: なし
- global mutable state依存: なし
- 用途: ヒヤリ月2件集計の対象月決定
- 推奨先: `js/safety-near-utils.js`

### nextRecordId(prefix, list)
- DOM依存: なし
- localStorage依存: なし
- 引数データ依存のみ
- 用途: デモ用ID採番
- 推奨先: `js/core-utils.js`
- 注意: 本番DBの採番方式には流用しない

### datePlusDays(base, n)
- DOM依存: なし
- localStorage依存: なし
- 用途: 苦情フォロー期限候補
- 推奨先: `js/core-utils.js`
- 先行テスト: 月末 / 年末 / うるう年 / 不正日付

## Phase 1ではまだ動かさない関数

### appNowLabel()
`APP_TIME_ZONE` に依存するため、時刻関連定数とセットで移す必要があります。

### complaintRankLabel()
`COMPLAINT_RANKS` に依存するため、苦情モジュール移行時にまとめます。

### employeeQuotaStateAtMonthStart()
純粋関数に近いものの、transitionHistoryの業務仕様を持つためヒヤリ領域のテストを固定してから移します。

## Phase 2候補 — 保存・復旧

対象:
- coreSaveItems()
- captureCoreSaveSnapshot()
- verifyCoreSave()
- rollbackCoreSave()
- currentCoreRevision()
- nextCoreRevision()
- coreSaveRevisionIsCurrent()
- recovery-required管理
- storage event競合検知

### 移行前に固定する必須試験

1. 正常保存
2. 途中書込み失敗
3. verify不一致
4. rollback成功
5. rollback失敗 → recovery-required
6. recovery-required中の保存拒否
7. 正常backup復元後の解除
8. 別タブ更新検知
9. revision一致・不一致
10. reload後の状態継続

## Phase 3候補 — 権限

対象:
- ACCESS_POLICY
- accessRuleAllows()
- canAccess()
- grantedEmployees()
- scopedEmployees()
- guardEmployeeView()
- guardEmployeeEdit()
- guardManagementRecord()

### 原則

UIの権限は表示制御。productionの正はAPI側認可とする。
full / scoped / self の3モードを移行前後で同一テストに通す。

## 起動処理は最後まで残す

以下は最後に扱う:
- RELEASE_VERSION
- APP_DATA_SCHEMA
- BOOT_HEALTH
- runBootMigrations()
- setSize()
- setPreviewRole()
- renderAll()

理由:
起動順序の変更がTDZ・未定義参照・DOM未生成参照へ直結するため。

## 現在の安全網

- inline JavaScript構文テスト
- top-level uppercase constant initialization orderテスト
- V200 UI/API release consistencyテスト
- v197監査回帰テスト
- schema sanity
- authorization / concurrency
- work-import
- document security
- analysis系回帰テスト

## 次にコードを実際に動かす場合

最初の実装単位は `recordChangeLines` + `normalizedEmployeeDate` + `datePlusDays` 程度に限定する。
移動前後でCI全件成功を確認し、それから次の単位へ進む。
