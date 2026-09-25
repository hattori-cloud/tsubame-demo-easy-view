# V200 再々監査依頼 — 再監査残件修正版

更新日: 2026-09-25

## 1. 監査対象

旧再監査固定点:
`2f67ca906767129b99e5cc8a6a52dd0516c093bc`

**今回の再々監査コード固定点:**
`5bd164f4ea9d1c94d62c2abf7a5aa8f7fa51c5b6`

前回再監査で Partially Fixed とされた H03 / H06 / H08、および新規 N01 を修正しています。

## 2. 固定点の実証

GitHub Actions:
- 296 tests / 296 pass / 0 fail
- PostgreSQL 16 schema apply: success
- optimistic concurrency: 1 success / 1 VERSION_CONFLICT
- pg_dump -> pg_restore -> restore verification: success
- external-audit regression cases: success
- real employee data: not used

Vercel:
- exact SHA `5bd164f4...` preview: READY
- latest checked runtime errors: 0

## 3. H03 — Password credential race

修正:
- primary credential verification後、MFA challenge / session発行transaction内でusers rowを `FOR UPDATE`
- current employee/account state、lock、employee_noに加え、current password_hashが最初に検証したpassword_hashと同一か再確認
- credential変更済みなら `CREDENTIALS_CHANGED` としてgeneric 401
- reset/change側のuser lockと同じrow boundaryを使う

実DB/API競合回帰:
- password reset vs old-password login:
  - reset: completed
  - concurrent old password login: 401
  - active sessions: 0
- password change vs old-password login:
  - change: 200
  - concurrent old password login: 401
  - active sessions: 0

## 4. H06 — Vehicle-related scope leakage

修正:
- deadline vehicle rowsはprimary employeeをscope-filtered LEFT JOIN
- out-of-scope employeeの場合:
  - employee_id null
  - employee_no null
  - employee_name null
  - office / department null
- vehicle update responseはraw `UPDATE ... RETURNING *` をそのまま返さず、権限適用済み `getVehicle()` で再取得して返却

実DB/API回帰:
- self /vehicles: 403
- scoped /vehicles: 200
- scoped vehicle response: out-of-scope name / employee_no / UUID leakなし
- self/scoped /deadlines: out-of-scope name / employee_no / UUID leakなし
- scoped vehicle PATCH response: out-of-scope name / employee_no / UUID leakなし

## 5. H08 — Demo completed complaint edit workflow

修正:
- completed complaintは通常 `openComplaintForm()` から編集不可
- detail画面は「理由を入力して再開」ボタンを表示
- reopen reason必須
- reopen時:
  - status -> 対応中
  - completedDate / finalReviewerNameクリア
  - reopenReason / reopenedDate / reopenedBy記録
  - audit `苦情対応再開`
- reopen前に `coreMutationReady()` を通し、stale localStorage stateでも直接変更不可

回帰:
- API側: completed後の通常編集 -> REOPEN_REQUIRED
- UI側: completed complaint edit入口遮断・理由付きreopen helper・audit・stale-state guardを専用testで固定

## 6. N01 — Vehicle q-search SQL regression

原因:
- template literal内のPostgreSQL parameter markerが `${p}` となり、実SQLに `$N` が出なかった

修正:
- literal `$${p}` を使用
- source再取得で `v.car_no ilike $${p}` などを確認

実DB/API回帰:
- full admin vehicle q-search: 200
- scoped manager vehicle q-search: 200

## 7. 外部監査回帰結果

固定点CIで以下すべて成功:
- H01 last-full-admin concurrent retirement
- H02 MFA stale enrollment
- H03 password reset/change credential race
- H04 concurrent safety update
- H05 manager-only safety records
- H06 vehicle/deadline/update scope masking
- H07 employee renumber
- H08 completion/reopen API rule
- M01 same-day vehicle assignment
- N01 vehicle q-search

## 8. 再々監査で確認してほしいこと

1. H03を同等以上に厳しいlock timingで再現し、old credentialがchallenge/sessionを発行できないこと
2. H06で vehicle list/detail/update/deadline/search の全経路からscope外employee UUID/番号/氏名が出ないこと
3. H08でデモUIのcompleted complaintを通常編集・状態select変更で迂回できないこと
4. N01でqあり/なし、full/scoped、氏名/社員番号/号車検索が500にならないこと
5. 今回の修正による新規Critical/High/Medium回帰がないこと

## 9. 既知の本番前ブロッカー

- private original-document storage実アダプター
- shared network-source distributed rate limiter
- production UI/API完全接続
- work-import commit/history/rollback本番経路
- least-privilege production DB role
- real-company auth/MFA/DB/storage environment
- migration reconciliation
- PC / 390px / 320px / iPhone / Android / VPN / multi-device UAT

## 10. 判定依頼

各項目を:
- Fixed
- Partially Fixed
- Reproduced
- New Regression

で判定してください。

**実社員情報・実原本は使用しないでください。**