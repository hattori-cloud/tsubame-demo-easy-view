# CODEX 再監査依頼 — V200 監査指摘修正版

更新日: 2026-09-25

## 1. 再監査対象

リポジトリ: `hattori-cloud/tsubame-demo-easy-view`

ブランチ: `staging-v200-backend`

旧監査固定点:
`96e1bbfa301536a50b8894b31276e0f793092901`

**再監査コード固定点:**
`2f67ca906767129b99e5cc8a6a52dd0516c093bc`

旧固定点に対する監査結果 `V200_AUDIT_RESULT_96e1bbf` の H01〜H08 / M01〜M03 / L01 を対象に修正しています。

この再監査では、まず上記固定点で再現しないことを確認してください。
branch先端が資料更新で進んでも、コード判定は `2f67ca...` を基準にしてください。

## 2. CI結果

固定点 `2f67ca...`:

- Node regression: **295 tests / 295 pass / 0 fail**
- PostgreSQL 16 schema apply: 成功
- append-only audit/history: 成功
- optimistic concurrency: 成功
- pg_dump → pg_restore → restored verification: 成功
- external-audit regression harness: **成功**
- 実社員データ: **不使用**

## 3. 外部監査回帰の実測

`scripts/verify-audit-regressions-v200.js` をCIで実行。

### H01 — 最後の全社管理者2名の並列退職

結果:
- 1件: retired成功
- 1件: `LAST_FULL_ADMIN_REQUIRED`
- active full administrator: 1名維持

退職処理は社員/usersロックより前に共通advisory lockを取得する。

### H02 — 別の古いMFA登録チャレンジによる鍵上書き

結果:
- 最初の登録: 200
- 同一challenge replay: 401
- 別の古いenroll challenge: 401

初回MFA登録をuser単位でsingle-use化し、登録済みユーザーの鍵を古い初回登録challengeで上書きできない。

### H03 — パスワード再設定後の古いMFA登録手続き

結果:
- stale enrollment complete: 401
- active sessions: 0

password reset発行・完了、通常password changeでpending MFA challengeを失効する。

### H04 — 同じversionの事故同時更新

結果:
- 1件成功
- 1件 `VERSION_CONFLICT`
- version: 1回だけ増加
- history: 1行のみ

安全記録更新をrow lock / version確認後に処理する。

### H05 — 一般社員への管理者限定安全情報

一般社員で:
- /accidents → 403 MANAGER_REQUIRED
- /complaints → 403 MANAGER_REQUIRED
- /guidance → 403 MANAGER_REQUIRED

管理者限定情報をself userへ返さない。

### H06 — 共用車両経由の担当範囲外社員情報

結果:
- self user vehicle list: 403
- scoped manager: 200
- out-of-scope employee name / employee_no / UUID leak: false

担当範囲外社員を車両経由で露出しない。

### H07 — 社員番号変更API

結果:
- route status: 200
- employee UUID維持
- employee_no更新成功

誤配置されていた `target` 参照を除去し、退職continuity lockを本来の退職処理へ移動。

### H08 — 完了・再開手順の通常更新迂回

結果:
- 必須不足complete: 拒否
- 通常updateでcompleted化: 拒否
- 正式complete: 成功
- complete後の通常編集: `REOPEN_REQUIRED`

terminal state変更は専用complete/reopen経路へ限定。

### M01 — 同日中の車両担当再編集

結果:
- 1回目 assignment: 200
- 同日2回目 assignment: 200
- active assignment rows: 2

replace-allではなくdelta更新へ変更。
DB制約もactive assignment一意性を正として整理。

## 4. UI / Excel側の監査指摘

### M02 — 分析センター 部署・雇用区分フィルター

修正:
- `analysisCenterDimensionChanged()` でselect値をstateへ保存してから再描画。
- 描画側のsyncで古いstateが選択値を上書きしない。

回帰:
- `tests/analysis-center-filters-v200.test.js`

### M03 — JST年度開始日のUTCずれ

修正:
- `analysisCenterDateText()` は `toISOString().slice(0,10)` を使わず、local year/month/dayからYYYY-MM-DDを生成。

回帰:
- `tests/analysis-center-safety-transfer-v200.test.js`

### L01 — Excel 1904 date system

修正:
- workbookの `properties.date1904` を取得。
- duration Date cellのepochを1900/1904で切替。

回帰:
- `tests/work-import.test.js`
- 60.5時間の1904-system durationを実パーサーで確認。

## 5. 再監査で重点確認してほしい点

1. H01の退職 vs 退職、退職 vs 降格、退職 vs 停止のlock order
2. H02の別enroll challenge / 同時enroll complete / 再登録経路
3. H03のpassword reset / password changeとMFA challengeの競合
4. H04のaccident / complaint / near-miss / complete / reopen / archive全更新経路
5. H05のself user直接URL / query / router迂回
6. H06のvehicle list / detail / search / assignmentsからのscope外UUID/氏名漏えい
7. H07の旧社員番号検索、user/資格/車両/事故/履歴参照維持
8. H08のcreate時terminal state指定、通常patch、完了後編集
9. M01の同日解除→再割当履歴とactive uniqueness
10. M02/M03の実ブラウザー再操作
11. L01の1900/1904両方式

## 6. 既知の未完成事項

今回の監査修正とは分離してください。

- production UIとproduction APIの完全接続
- work-importのcommit/history/rollback本番経路
- private original-document storage実アダプター
- distributed network-source rate limiter
- least-privilege production DB role
- 実会社auth/MFA/DB/storage環境
- migration reconciliation
- 実機PC / iPhone / Android / VPN / 複数端末UAT
- fixed SHAのVercel実配備一致確認

これらはfail-openしていない限り、旧監査H01〜H08の再発とは分けて判定してください。

## 7. 報告形式

各項目について:

- Fixed / Partially Fixed / Reproduced
- Critical / High / Medium / Low
- 対象ファイル・関数
- 再現手順
- 実測結果
- 固定点 `2f67ca...` で再現するか
- 新規回帰がないか
- 本番前に残すべき停止条件

を報告してください。

**実社員情報・実PDF/画像/スキャン原本は使用しないでください。**
