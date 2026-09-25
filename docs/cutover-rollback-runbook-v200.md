# V200 本番切替・ロールバック手順

更新日: 2026-09-25

## 原則

切替作業中に想定外が起きた場合、「その場で直して続行」しない。
安全側へ戻し、原因を修正して再実施する。

## 1. 切替前

- CODEX Critical 0 / High 0
- production readiness checklist合格
- migration reconciliation合格
- UAT合格
- DB backup完了
- restore test完了
- object storage backup/restore完了
- rollback担当者決定
- cutover担当者決定
- 連絡先確認

## 2. 変更凍結

cutover開始時刻以降:
- legacy側の更新停止
- source export
- export件数/hashes記録
- migration batch id採番

## 3. DB

- migration roleでschema/migration
- runtime roleへ切替
- app roleでDDL不可確認
- readiness probe
- append-only guard確認
- row count確認

## 4. 認証

- production auth secrets
- MFA key
- initial full admins
- scoped users
- last-full-admin guard
- test login
- test MFA
- test logout

## 5. 原本

原本adapter未完成ならここでNO-GO。

完成時:
- upload quarantine
- malware scan
- finalize
- download
- strict + MFA
- restore/SHA

## 6. production activation

最後に:
`TSUBAME_ENABLE_PRODUCTION_BUSINESS_DATA=1`

直後にsmoke:
1. health
2. login
3. MFA
4. employee read
5. scoped employee read
6. vehicle list/search
7. deadlines
8. accident create/update
9. audit
10. logout

## 7. 監視

切替後:
- 5xx
- auth failure anomaly
- DB connection
- latency
- audit write failure
- storage failure
- unexpected scope denial/leak

## 8. 即ロールバック条件

以下は即停止:
- scope外個人情報漏えい
- login/MFA bypass
- stale updateのsilent overwrite
- audit書込不能
- DB参照整合破損
- original document public exposure
- repeated unexplained 5xx
- migration件数不一致

## 9. ロールバック

優先:
1. `TSUBAME_ENABLE_PRODUCTION_BUSINESS_DATA` を0/未設定へ戻す
2. business API fail-closed確認
3. 新規書込停止
4. incident時刻記録
5. DB snapshot確保
6. 必要ならpre-cutover DBへrestore
7. DNS/domain切替がある場合は旧系へ戻す
8. ユーザーへ利用停止通知
9. 原因分析

ロールバック時も監査証跡を残す。

## 10. 再開条件

- 原因特定
- 回帰test追加
- CI success
- staging reproduction
- CODEX再確認（重大時）
- UAT再確認
- rollback原因に対するmonitoring追加

## 11. 切替記録

記録:
- start/end
- fixed SHA
- Vercel deployment id
- DB migration id
- migration batch id
- source/destination counts
- activation time
- smoke test result
- issues
- rollback有無
- approver
