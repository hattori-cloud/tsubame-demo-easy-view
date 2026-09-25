# CODEX 最終大監査依頼 — V200 本番基盤9割候補

更新日: 2026-09-25

## 1. 監査対象固定点

リポジトリ: `hattori-cloud/tsubame-demo-easy-view`

対象ブランチ: `staging-v200-backend`

**コード監査固定コミット:**
`96e1bbfa301536a50b8894b31276e0f793092901`

このコミットを基準にコード監査してください。

内部大監査で発見・修正した事項と既知ブロッカーは `docs/audits/V200_INTERNAL_FINAL_AUDIT_20260925.md` も参照してください。
監査中にbranch先端が進んでも、指摘の再現可否はまずこの固定点で判定してください。

## 2. 今回の目的

つばめ交通の社員一元管理システムV200について、
「デモとして動くか」ではなく、**実社員データ投入前の本番基盤が9割水準まで来ているか**を大監査してください。

特に以下を優先してください。

1. データ消失・誤更新
2. 認証・MFA迂回
3. 担当範囲外アクセス
4. 退職後アクセス・古い認証フローの復活
5. UUID固定社員IDと可変社員番号の混同
6. 同時更新競合
7. audit/historyの改ざん
8. PostgreSQL型・制約・transaction不整合
9. backup/restore後の参照切れ
10. 単一Vercel API router化によるルート誤配信
11. 原本ストレージのfail-open
12. PC/スマホの主要導線

## 3. 直近の実証結果

GitHub Actionsで以下を実施済みです。

- Node: **285 tests / 285 pass / 0 fail**
- PostgreSQL 16 空DBへ本番候補SQLを実適用
- base 28 tables
- capacity追加後29 tables
- append-only audit/history UPDATE・DELETE拒否
- duplicate structural indexes 0
- 月次ヒヤリ zero / short / met / exempt
- 同一社員への2並列更新 → 1成功 / 1 VERSION_CONFLICT
- version +1のみ
- profile history 1行のみ
- pg_dump → 新規DBへpg_restore
- 復元後29 tables・ヒヤリ状態・append-only保護再確認
- 実社員データ不使用

Vercel:
- 70本のv1 handlerは内部モジュールとして維持
- `api/router.js` 1本をVercel Function入口とする
- `vercel.json` で `/api/v1/*` をrouterへ集約
- `96e1bbfa...` のGitHub固定ソースはCI合格。Vercel一覧で同一SHAのpreview反映は監査資料更新時点では未確認
- Node 22.xでbuild完了
- productionでは `TSUBAME_ENABLE_PRODUCTION_BUSINESS_DATA=1` を明示しても、認証・DB・private原本ストレージ環境・原本実アダプターreadinessが成立しない限り、health以外の業務APIをrouter入口で503拒否
- 現候補では原本実アダプターreadinessを意図的にfalse固定しているため、production業務APIは誤操作では有効化できない
- 将来有効化時もrouter入口でlive DB接続、主要schema、append-only監査保護、月次ヒヤリcapacity構造を再確認
- Vercelでは後続認証強化を含む `d8030dd...` までREADYを確認し、直近runtime errorsは0件。固定点 `96e1bbfa...` 以降のpreview未生成理由は、PR上のVercel Bot通知で `api-deployments-free-per-day`（Free枠の24時間100 deployments超過）と確認済み。コード失敗ではない。制限解除後に固定点と同一SHAのdeployment metadata一致確認を実施する

## 4. 実DB試験で既に見つけた問題

今回、静的テストだけでは発見できなかった以下を実DBで発見・修正済みです。

- PL/pgSQL trigger function bodyの構文不正
- employee audit/history SQLでentity_id(text)とemployee_id(uuid)へ同じ未型指定parameterを使う型衝突
- canonical table countの受入条件陳腐化
- Vercel `[employeeId]` / `[id]` dynamic route conflict
- Vercel Hobby 12 Functions制限

同じ原因の残存箇所がないか横断監査してください。

## 5. 認証・退職連動で確認してほしい点

現在の設計:

- ログイン: ID + 社員番号 + パスワード
- 管理者はMFA必須
- userはimmutable employee UUIDに紐づく
- 社員番号変更でsession identityは変えない
- 退職確定時:
  - usersをsuspended
  - active sessionsをemployee_retiredで失効
  - pending MFA challenge無効化
  - unused password reset token無効化
  - MFA失敗をアカウント単位でロックアウトへ反映
  - 停止時は保留中認証情報も無効化
  - 個別監査ログ
- session発行直前にもuser active / employee not retired / account lockをDBで再確認
- MFA challengeはDB上で原子的に1回だけ消費し、同時replayでは1件だけ成功
- MFA初回登録secretは同時開始でも上書き競合しない
- 最後のactive full administratorは降格・停止・退職できない。PostgreSQL advisory lockで同時操作も保護

競合タイミングを含めて迂回がないか確認してください。

## 5-A. 今回の内部大監査で修正済みの重要項目

固定点までに内部大監査で以下を発見・修正済みです。重複修正ではなく、CODEXでは残存・類似箇所を重点確認してください。

- 書類の qualification_id が別社員の資格へ紐づけられる参照整合性
  - APIで同一社員・active資格を検証
  - DBで (qualification_id, employee_id) 複合FK
- 事故・苦情 owner_user_id の担当範囲検証不足
  - active full/scoped managerかつ対象社員担当範囲をサーバー検証
- 引継ぎ先がself-only / 担当範囲外でも指定できる経路
  - active full/scoped manager＋対象社員scopeを強制
- 最後の全社管理者を降格・停止・退職できる事業継続リスク
  - transaction advisory lock＋最低1 active full adminを強制
- MFA成功challengeの同時replay
  - PostgreSQL条件付きUPDATEでsingle-useを実DB並列試験
- MFA初回登録secretの同時初期化競合
  - pending secretをatomicに一度だけ設定
- ログイン失敗のaccount状態による応答時間差
  - generic failureを最低待機時間へ揃える
- production activationが環境変数だけで開き得る危険
  - private原本実アダプター未完成中はhard fail-closed
  - 将来もlive DB readinessをrouterで確認

資格 ↔ 書類のemployee_id一致、担当者/引継ぎscope、最後のfull admin保護、MFA single-useを類似経路も含めて再監査してください。

## 6. DB監査で確認してほしい点

適用順:
1. `docs/production-schema.sql`
2. `docs/production-capacity-v189.sql`

CI:
- `scripts/verify-production-db-v200.js`
- `scripts/verify-concurrency-v200.js`
- `scripts/verify-restored-db-v200.js`
- `.github/workflows/staging-v200-tests.yml`

確認対象:
- schema / indexes / FK / CHECK
- uuid/text型
- transaction boundaries
- optimistic concurrency
- append-only triggers
- user/account state transitions
- historical snapshots
- backup/restore
- migration assumptions

## 7. Vercel単一router監査

関数数制限回避のため、ファイルベースAPIをそのまま70 Functionsとして配備せず、
`api/router.js` から既存 `api/v1/**` handlersをdispatchしています。

確認してください:

- static route優先順位
- dynamic route capture
- `req.query.id`, `kind` 等の復元
- route collision
- 404 fail-closed
- method制限が各handler側で維持されること
- auth/security headersが迂回されないこと
- router追加で未認証APIが増えていないこと

## 7-A. 既知の本番前残課題

以下は固定点で「実装済み」とは扱っていません。

- 共有ネットワーク単位のログイン試行制限
  - account単位の失敗回数ロックとgeneric failure delayは実装済み
  - Vercel各instanceのメモリではなく、共有DB/Redis相当の分散rate limiterが本番前に必要
- private原本ストレージ実アダプター
  - upload/quarantine/MIME/size/SHA-256/malware/finalize/download/restoreを実接続で受入試験する
- 実会社認証・本番DB・private storage環境接続
- migration reconciliationと実社員データ件数/参照整合照合
- PC / 390px / 320px browser UAT
- VPN / 複数端末 / 複数利用者の実機UAT
- 固定SHAとVercel deployment metadataの一致確認（現時点の未確認理由は `api-deployments-free-per-day` 制限）

これらはCODEXに「既知の実環境/本番前ブロッカー」として分類してもらい、別のコード不具合と混同しないでください。

## 8. 原本ファイルはまだ本番投入禁止

原本storage endpointは現在意図的にfail-closedです。

- upload-ticket → private adapter未完成なら503
- finalize → quarantine/SHA-256/malware clean adapter未完成なら503
- download-ticket → active + malware clean確認後でもadapter未完成なら503
- strict documents → full admin + MFA
- metadata updateからstorage key / SHA / malware state等を変更不可

**実PDF・画像・スキャン原本を監査のために投入しないでください。**

ここは「未実装だからCritical」ではなく、本番接続前の既知ブロッカーとして、
fail-closedが破られていないかを監査してください。

## 9. 実社員情報禁止

実社員の氏名、社員番号、健康情報、資格番号等を作成・推測・補完しないでください。
CIの `CI9001` 等は明示的な架空監査データです。

## 10. 報告形式

各指摘を次の順で出してください。

- Critical / High / Medium / Low
- 対象ファイル・関数
- 再現手順
- 実害
- 原因
- 最小修正案
- 固定コミット `96e1bbfa...` で再現するか
- 既知の実環境未接続ブロッカーか、新規不具合か

最後に、
- 実社員データ投入前に必ず直す項目
- 実環境接続時に確認する項目
- 本番昇格後でもよい改善
を分けてください。

全面リファクタリングは、重大問題の切り分け前には行わないでください。
