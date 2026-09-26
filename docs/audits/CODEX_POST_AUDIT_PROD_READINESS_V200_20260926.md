# CODEX 再々監査後・本番準備大監査依頼 — V200

更新日: 2026-09-26

## 1. 監査対象固定点

リポジトリ: `hattori-cloud/tsubame-demo-easy-view`

対象ブランチ: `post-audit-v200-prod-readiness`

**コード・DB/API・本番画面監査固定コミット:**

`909ded89fe489d738864185458deab46635ff15e`

このSHAを動かさず、まずここで再現性を判定してください。
この固定点以降に追加するコミットは監査依頼資料のみとし、機能コードの監査基準には含めません。

旧監査固定点 `5bd164f4...`、`96e1bbfa...` は監査履歴として残します。今回の対象と混同しないでください。

## 2. 今回の位置づけ

旧固定点の再々監査では H03 / H06 / H08 / N01 が Fixed、新規 Critical / High / Medium 0件でした。
残っていた O01 / Medium と O02 / Low は監査固定点を変更せず、次期本番準備ブランチで修正し、本ブランチへ選択移植済みです。

今回の目的は、デモの見た目ではなく、**実社員データ投入前の本番準備コードが本番直前水準に達しているか**を再監査することです。

現時点の内部評価はコード・DB/API・本番画面で約96〜97%です。
これは本番開始承認ではありません。実環境接続・実機UAT・実移行照合は別ゲートです。

## 3. 固定点CI実績

GitHub Actions run: `36208671483`

- Node回帰テスト: **334 / 334 pass / 0 fail**
- PostgreSQL 16 空DBへ本番候補schema/capacityを実適用
- runtime最小権限DBロールを検証
- append-only audit/history保護を検証
- shared PostgreSQL login rate limiter構造を検証
- 勤務取込 preflight / commit / history / rollback を実DBで検証
- optimistic concurrency / VERSION_CONFLICTを検証
- pg_dump → 別DB pg_restore → 復元後検証
- 内部監査回帰ケースを実DBで再確認
- 原本契約を実PostgreSQL＋架空原本で検証
- 実社員データ: **不使用**

Vercel:
- `eef4858db...` まではPreview **READY** を確認済み
- 固定SHA `909ded89fe489d738864185458deab46635ff15e` はVercelのbuild rate limitで自動配備されていない
- GitHub combined statusのVercel failureは `upgradeToPro=build-rate-limit` であり、コードbuild failureとは分けて扱うこと
- 最新固定SHAとdeployment metadataの完全一致は、制限解除後の実環境ゲート

## 4. 再々監査後に統合したO01/O02

### O01 / Medium
苦情完了条件をAPIとUIで統一:

- クレームランク
- 指導内容
- 次回対応内容

専用回帰テストあり。

### O02 / Low
320px幅で苦情詳細モーダル/ヘッダーがviewportを押し広げないよう:

- `min-width:0`
- 折返し
- `max-width:100vw`

を追加。専用回帰テストあり。

## 5. 本番DB/API強化

以下は固定点までに実装済みです。

- immutable employee UUIDと可変employee numberの分離
- employee number変更履歴
- migration reconciliation:
  - employee_number_history孤児 → fail
  - 最新履歴new_employee_noと現在employee_no不一致 → fail
  - 別社員への番号再利用 → 会社ルール未確定のためwarning
- shared PostgreSQL login rate limiter
- runtime最小権限DB role
- production router live DB readiness:
  - schema
  - append-only audit
  - near-miss capacity
  - distributed login rate limit
  - work import persistence
  - runtime DB role
- 勤務取込:
  - preflight batch
  - normalized DB persistence
  - If-Match commit
  - history
  - later-change clobber防止rollback
- 苦情詳細GETをserver-side scope付きで追加
- `/me` にemployee_idを返しself-serviceを成立
- `/me.data_mode` を実runtimeに合わせて返却

## 6. 本番API画面

`/production` を現行V200 API契約へ接続済みです。

確認対象:

- ID + 現社員番号 + パスワード
- MFA
- server-side Cookie session
- 社員
- 期限
- 事故
- 苦情
- 車両
- ヒヤリ
- 安全分析
- 資格・書類閲覧
- 利用者管理
- 勤務取込

重要:

- production UIは業務データをlocalStorage/sessionStorageへ保存しない
- 勤務取込は旧ファイル再送方式でなく、preflight batch → If-Match commit → rollback
- 資格・書類は現行employee credentials APIを使用
- private原本が本番安全ゲートを通る前は原本新規登録UIを開放しない

## 7. private原本ストレージ

Vercel Private Blob transportを実装済みです。

確認対象:

- provider: `vercel-blob-private`
- `@vercel/blob 2.8.0` 固定
- private signed PUT / HEAD / GET
- short-lived authorization
- single pathname / operation scope
- allowed MIME / maximum size
- `allowOverwrite=false`
- `addRandomSuffix=false`
- download/readback `useCache=false`
- opaque key: `quarantine/<random>`
- keyに社員名・社員番号・元ファイル名を含めない
- actual private objectを読み戻してSHA-256再計算
- static tokenまたはVercel OIDC + Blob store ID
- browserへraw storage keyやpermanent URLを返さない

## 8. malware scanner / quarantine

原本処理は次の3段階です。

1. **quarantine pending**
2. **scanner verdict**
3. **clean only activation**

production scannerはprovider-neutralな `private-https` contractです。

ready条件:

- 明示的company approval flag
- HTTPS endpoint
- 32文字以上のsecret token
- private storage transport ready

scannerへ送信する情報:

- 原本bytes
- MIME
- server-computed SHA-256
- request id

送信しない情報:

- 社員氏名
- 社員番号
- 元ファイル名

scanner responseは `clean` / `blocked` と同じSHA-256が必須です。
timeout / network error / HTTP error / malformed response / SHA mismatch は `error` であり、cleanに昇格しません。

DB lifecycle:

- upload受領直後: `storage_state=quarantine`, `malware_scan_status=pending`
- clean: scan resultをDB/history/auditへ記録後のみactive化可能
- blocked: `storage_state=blocked` をDBに恒久記録し通常閲覧不可
- error: quarantine継続、active化不可
- blocked/errorでもSHA-256、scan時刻、監査/historyを残す
- 同一upload ticketは短いtransient retryでidempotent
- active済みまたはconflicting storage keyは拒否

実DB原本契約試験で:
- pending → clean → active
- blocked → durable blocked
- SHA-256保持
- malware clean/blocked audit
を確認済みです。

## 9. live production readiness

`scripts/check-production-readiness-v200.js` は環境変数の存在だけでは合格しません。

live確認:

- PostgreSQL接続
- schema
- append-only guard
- near-miss capacity
- distributed login rate limit
- work import persistence
- runtime least privilege
- private Blob signed authorizationを実際に発行できること
- scannerへ固定の**架空・非社員 synthetic PDF**を送り、clean＋同じSHA-256が返ること

scanner live probeに実社員原本は使いません。

## 10. 特に再監査してほしい領域

重大度順に確認してください。

1. 認証 / session / MFA / password reset /退職競合
2. full / scoped / selfのserver-side authorization迂回
3. employee UUIDと可変社員番号の混同
4. owner / handoff / document scope
5. 最後のactive full admin保護
6. shared login rate limiterの競合・回避
7. work-import batchの所有者・version・rollback競合
8. migration reconciliationの過不足
9. audit/history append-only
10. private Blob signed URL scope / expiry / overwrite
11. quarantine → scan → activationのfail-open
12. scanner response hash binding
13. blocked/error原本の閲覧・再finalize迂回
14. signed URL / storage key / scanner tokenのログ・API漏えい
15. production readiness live probeのfalse-positive
16. single API routerのroute collision / auth bypass
17. production UIと現行API contractの不一致
18. 320px / 390px / PCでの画面崩れ

## 11. 既知の実環境ブロッカー

次は「コード不具合」と混同せず、実環境接続ブロッカーとして分類してください。

- private Blob **実ストア**の作成・資格情報/OIDC接続
- production scanner providerの契約・DPA・会社承認・実endpoint接続
- 実資格情報でlive readinessを全合格させる
- 本番PostgreSQL実接続
- 実会社利用者でID + 社員番号 + password + MFA UAT
- active company user registryの実データ照合
- 実社員migration manifestと最終reconciliation
- object storage secondary backup
- DBと別障害領域への原本backup
- restore後のobject size/SHA-256照合
- PC / 390px / 320px実ブラウザUAT
- VPN / 複数端末 / 複数利用者UAT
- 固定SHAとVercel deployment metadata一致確認

## 12. 禁止事項

- 実社員データを監査用に作成・補完・投入しない
- 実PDF/画像/スキャン原本を本番前監査へ投入しない
- scanner接続先を監査者判断で第三者サービスへ変更しない
- retention年数など会社決裁待ちルールを推測して固定しない
- employee number再利用可否を推測でエラー化しない

## 13. 報告形式

各指摘:

- Critical / High / Medium / Low
- 対象ファイル・関数
- 再現手順
- 実害
- 原因
- 最小修正案
- 固定SHA `909ded89fe489d738864185458deab46635ff15e` で再現するか
- 既知の実環境ブロッカーか、新規コード不具合か

最後に分けてください:

1. 実社員データ投入前に必ず修正
2. 実環境接続時に確認
3. 本番昇格後でもよい改善

全面リファクタリングは重大問題の切り分け前に行わないでください。
