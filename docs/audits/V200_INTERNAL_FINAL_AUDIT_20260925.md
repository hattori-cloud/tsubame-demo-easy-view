# V200 内部最終大監査報告

更新日: 2026-09-25

## 結論

コード・DB/API設計の監査固定点は以下。

`96e1bbfa301536a50b8894b31276e0f793092901`

この固定点は、実社員データを投入する前の **9割水準コード監査候補** と判断する。

ただし、実環境の本番稼働準備完了とは判断しない。
private原本ストレージ実アダプター、共有network-source login rate limiter、実会社認証/DB/storage接続、migration reconciliation、PC/スマホ/複数端末UATが未完了である。

現候補はそれらが未完成のままproduction業務APIを誤開放しないようfail-closedしている。

## 固定点での実証

GitHub Actions:

- 285 tests / 285 pass / 0 fail
- PostgreSQL 16 空DB適用成功
- base 28 tables
- capacity / restore後29 tables
- audit_logs / record_histories append-only保護実証
- structural duplicate indexes 0
- near-miss monthly compliance: zero / short / met / exempt
- optimistic concurrency: 同一version並列更新 1成功 / 1 VERSION_CONFLICT
- version +1のみ
- history 1行のみ
- pg_dump → 別DB pg_restore → 復元後検証成功
- full_admin_continuity_guard=true
- mfa_challenge_single_use=true
- 実社員データ不使用

## 内部監査で発見・修正済み

### High相当 — 資格と書類の別社員誤リンク

対象:
- `api/_lib/credential-store.js`
- `docs/production-schema.sql`

問題:
書類作成時の `qualification_id` が対象社員本人の資格かを十分に保証していなかった。

修正:
- APIで同一employee_idかつ有効資格を確認。
- DBで `(qualification_id, employee_id)` 複合FKを追加。

### High相当 — 事故・苦情担当者のscope検証不足

対象:
- `api/_lib/safety-store.js`

問題:
`owner_user_id` に担当範囲外または適切でない利用者を指定できる余地があった。

修正:
- active full/scoped managerのみ。
- scoped managerは対象社員のoffice × departmentを担当することを必須化。

### High相当 — handoffで担当範囲外へ情報を渡せる経路

対象:
- `api/_lib/workflow-store.js`

問題:
引継ぎ先がactive userであることだけを確認しており、self-onlyまたは対象社員の担当範囲外managerを指定できた。

修正:
- recipientはactive full/scoped managerに限定。
- employee付きhandoffはrecipient scope一致を必須化。
- scoped senderはemployee未指定handoffを作れない。

### High相当 — 最後の全社管理者を失う運用停止

対象:
- `api/_lib/admin-continuity.js`
- `api/_lib/user-store.js`
- `api/_lib/employee-store.js`

問題:
最後のactive full administratorを降格・停止・退職すると、以後の管理操作を復旧できなくなる。

修正:
- 最低1人のactive full administratorを必須化。
- demotion / suspend / retirement共通。
- PostgreSQL transaction advisory lockで並列操作も保護。
- 実PostgreSQL試験済み。

### High相当 — MFA challenge同時replay

対象:
- `api/_lib/auth-store.js`
- `api/v1/auth/mfa/verify.js`
- `api/v1/auth/mfa/enroll/complete.js`

問題:
同じMFA challengeをほぼ同時に成功送信した場合、両方が未使用状態を先読みする競合余地があった。

修正:
- challenge消費を条件付きUPDATEでatomic化。
- session発行前にchallengeを1回だけ消費。
- 2件目はgeneric MFA failure。
- 2 PostgreSQL clientで1成功 / 1拒否を実証。

### Medium相当 — MFA初回登録secretの同時上書き

対象:
- `api/_lib/auth-store.js`
- `api/v1/auth/mfa/enroll/start.js`

修正:
- pending secretは未設定時だけ保存。
- 同時開始の敗者はDBに先に保存されたsecretを返す。
- suspended / retired / locked accountは開始不可。

### Medium相当 — login失敗の応答時間差

対象:
- `api/v1/auth/login.js`

問題:
存在しないIDと、停止・番号不一致等で失敗時間が異なり、account状態推測の補助情報になり得た。

修正:
- generic login failureに最低待機時間を設定。

### High相当 — production誤開放ゲート

対象:
- `api/_lib/runtime-config.js`
- `api/router.js`
- `api/_lib/db.js`

修正:
- production明示activation flagを要求。
- auth / DB / private storage envだけでなくoriginal-document adapter readinessを要求。
- current candidateではadapter readinessを意図的にfalse固定。
- 将来有効化時にもlive DB接続、主要schema、append-only guards、capacity構造をrouter入口で検査。

## 以前から修正・実証済みの重要事項

- employee UUIDを固定IDとし、employee_no変更履歴を分離。
- employee renumberingはtransaction + version保護。
- retired userのsession発行禁止。
- retirementでaccount suspend + 全session失効 + pending MFA/reset token無効化。
- access変更でsession失効。
- audit/history DB append-only。
- Vercel dynamic route conflictを解消。
- Vercel Hobby Functions上限をsingle routerで解消。
- production schema実適用。
- multi-user optimistic concurrency。
- DB backup/restore。
- historical safety snapshots。
- monthly near-miss targets snapshot。

## 既知の本番前ブロッカー

### 実装・接続が必要

1. private original-document storage実アダプター
   - private upload
   - quarantine
   - MIME / size
   - SHA-256
   - malware scan
   - finalize
   - short-lived download authorization
   - DB + object storage別障害領域backup
   - restore + SHA-256照合

2. shared network-source login rate limiter
   - account lockoutは実装済み
   - network/IP sourceの制限はVercel instance memoryではなくshared DB/Redis-class storeで実装する

3. 実会社環境
   - real auth / MFA
   - production PostgreSQL
   - least-privilege DB role
   - private storage
   - environment secrets

4. migration reconciliation
   - 社員件数
   - immutable employee ID割当
   - current / old employee numbers
   - office / department
   - active / retired
   - references

5. UAT
   - PC
   - 390px
   - 320px
   - VPN
   - 複数端末
   - 複数利用者
   - stale update / concurrent edit

### Vercel deployment確認

Vercelでは後続認証強化を含む `d8030dd...` までREADY、直近runtime errors 0を確認。

固定点 `96e1bbfa...` とVercel deployment metadataの完全一致は、資料作成時点では未確認。
したがって「固定点preview READY」とはまだ判定しない。

## 本番投入禁止

以下が完了するまで禁止:

- 実社員情報投入
- 実PDF / 画像 / スキャン原本投入
- production business API activation

## CODEXへの引継ぎ

CODEXはまず固定点 `96e1bbfa...` を監査する。

優先確認:
1. 類似cross-scope referenceが残っていないか
2. auth / MFA / reset race
3. last-full-admin continuityの迂回
4. single router route/auth bypass
5. DB型・FK・transaction boundaries
6. backup/restore
7. fail-closed original storage
8. localStorage demo UIとproduction API境界
9. PC/mobile UAT

既知の未接続事項を新規Criticalと混同せず、fail-openしている場合だけ重大不具合として扱う。
