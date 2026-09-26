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


## 2026-09-25 内部大監査後の最終固定点

**CODEXコード監査固定点:**
`96e1bbfa301536a50b8894b31276e0f793092901`

このSHA以降は監査資料更新だけとし、CODEXはまずこの固定点でコード再現性を判定する。

### 最終CI実績

- Node回帰テスト: **285 / 285 pass / 0 fail**
- PostgreSQL 16 空DB本番候補schema実適用: 成功
- base tables: 28
- capacity適用・復元後: 29 tables
- append-only audit/history: UPDATE / DELETE拒否
- full_admin_continuity_guard: **true**
- mfa_challenge_single_use: **true**
- structural duplicate index: 0
- 月次ヒヤリ: zero / short / met / exempt
- optimistic concurrency: 1成功 / 1 VERSION_CONFLICT
- version: +1のみ
- history: 1行のみ
- pg_dump → 別DB pg_restore → 復元後検証: 成功
- 実社員データ: **不使用**

### 内部大監査で追加修正した事項

- qualificationとdocumentの別社員誤リンクをAPI＋DB複合FKで禁止
- 事故・苦情のownerをactive full/scoped manager＋対象社員scopeへ制限
- handoff recipientをactive full/scoped manager＋対象社員scopeへ制限
- scoped senderのemployee未指定handoffを禁止
- 最後のactive full administratorの降格・停止・退職を禁止
- full admin continuityをPostgreSQL advisory transaction lockで並列保護
- MFA成功challengeをDB原子操作でsingle-use化
- MFA初回登録secretの同時上書きを防止
- 停止/退職/lock中のMFA登録開始を拒否
- login generic failureの最低応答時間を揃えてaccount状態推測を抑制
- production activationを原本実アダプター未完成中はhard fail-closed
- 将来production activation時もlive DB readinessをrouter入口で再確認

### 現在も本番前ブロッカー

- private原本storage実アダプター実装・接続・隔離・scan・restore/SHA照合
- shared DB/Redis相当のネットワーク単位login rate limiter
- 実会社auth / MFA / 本番PostgreSQL / private storageの環境接続
- migration reconciliation / 実社員データ照合
- PC / 390px / 320px実ブラウザUAT
- VPN / 複数端末 / 複数利用者実機UAT
- 固定SHA `96e1bbfa...` とVercel deployment metadataの完全一致確認

### Vercel確認

- 単一router構成によるHobby Functions上限回避: READY実績あり
- 後続認証強化を含む `d8030dd...` までREADYを確認
- 直近runtime errors: 0
- branch previewは固定SHAまでdeployment一覧の反映を確認できていないため、固定SHA READYとはまだ表現しない

### 運用判断

コード・DB/API設計は**9割水準の大監査候補**。
ただし実環境は9割ではなく、上記本番前ブロッカーが残る。

特に原本アダプターは未完成であり、production業務APIはそのreadinessがfalseの間は有効化できない。
実社員情報・実PDF/画像/スキャン原本は引き続き投入禁止。


## 2026-09-26 監査後統合・95%準備更新

**統合先端固定点:**  
`cbe5a5ec64941f32b9e56d3e3d609d4ec098da9b`

### 今回統合・強化した事項

- 再々監査後のO01/O02修正を `post-audit-v200-prod-readiness` へ統合
  - 苦情完了条件を「クレームランク・指導内容・次回対応内容」に統一
  - 320px幅で苦情詳細モーダルがviewportを押し広げないよう修正
  - O01/O02専用回帰テストを統合
- production routerのlive DB readinessについて、共有login rate limiter・勤務取込永続化・runtime最小権限DBロールまでテストで固定
- migration reconciliationを強化
  - employee_number_history孤児を失敗扱い
  - 最新履歴new_employee_noと現在employee_noの不一致を失敗扱い
  - 別社員への社員番号再利用は会社ルール未確定のため自動失敗にせず警告として報告
- 本番API画面 `/production` を現行v200 API契約へ接続
  - ID＋現在社員番号＋パスワード、MFA、Cookie session
  - 社員・期限・事故・苦情・車両・ヒヤリ・安全分析・利用者管理等をserver APIで表示
  - browser localStorage/sessionStorageへ業務データを保存しない
  - 勤務取込は旧再送方式を使用せず、preflight batch → If-Match commit → conflict-safe rollback方式へ統一
  - 資格・書類閲覧は社員別credentials APIへ統一
  - private原本ストレージ本番接続前の電子原本新規登録UIは非公開
- 苦情詳細GETをserver-side scope判定付きで追加
- `/me` にemployee_idを追加し、本人self-service導線を成立
- `/me.data_mode` を環境に応じて `fictional-staging-fixtures` / `postgres` と正しく返却

### CI / Vercel確認

- `b99fa3a5...` O01/O02統合: GitHub Actions success
- `b1b6eb2...` production DB readiness gate test強化: success
- `9a8b653...` employee number history migration reconciliation: success
- `fa8d2d9...` employee number reuse警告扱い調整: success
- `13bd1a3d...` production API shell: GitHub Actions success
- `13bd1a3d...` Vercel preview: **READY**
- `bf018bfd...` / `9d90656c...` 苦情詳細GET: success
- `bf34cf49...` 苦情詳細回帰テスト: success
- `7358e493...` /me production identity修正: success
- `cbe5a5ec...` selected-user identity回帰テスト: success

### 現在の再分類

**コード側でほぼ解消済み**
- shared PostgreSQL login rate limiter
- runtime最小権限DBロール
- 勤務取込 preflight / commit / history / rollback
- migration reconciliation基盤
- 本番API画面
- O01 / O02
- production fail-closed gate
- Vercel preview配備

**実環境接続が必要で未完了**
- private原本storageのproduction実アダプター
- quarantine / malware scan / clean後有効化の実プロバイダー接続
- 原本object storageのbackup / restore / SHA-256実照合
- 実会社auth / MFA / 本番PostgreSQL / private storage環境変数・資格情報接続
- 実社員データのmigration manifest作成と最終reconciliation
- PC / 390px / 320px実ブラウザUAT
- VPN / 複数端末 / 複数利用者実機UAT
- 最新統合SHAと最終Vercel deployment metadataの一致確認

### 現時点の判断

コード・DB/API・本番画面を含む**本番準備実装はおおむね95%水準**。
ただし本番稼働承認は、上記「実環境接続が必要で未完了」の項目が完了するまで行わない。

実社員情報・実PDF/画像/スキャン原本は引き続き投入禁止。


## 2026-09-26 private原本ストレージ経路強化

**コード先端:** `fb43c44b387a21bf374142f694dd2d996bead355`

### private保管経路

- Vercel Private Blob用provider `vercel-blob-private` を追加
- `@vercel/blob 2.8.0` を固定
- private signed URLによる短時間PUT / HEAD / GET
- upload URLは単一pathname・単一operation・期限付き
- MIME / 最大サイズを署名条件へ含める
- `allowOverwrite=false` / `addRandomSuffix=false`
- storage keyは社員番号・氏名・原本ファイル名を含まないopaqueな `quarantine/<random>`
- 読取時は `useCache=false` とし、保存直後の原本確認で古いcacheを使用しない
- finalize前にprivate Blob本体を読み戻してSHA-256を再計算
- DBがactiveになるまではアプリからdownload authorizationを発行しない
- static tokenだけでなく、Vercel OIDC token + Blob store IDの接続方式も受け入れる設計

### 安全ゲート分離

原本readinessを以下へ分離した。

1. `document_storage_transport_ready`
2. `document_malware_scanner_ready`
3. `original_document_pipeline_ready`

private Blob保管経路だけがreadyでも、production業務APIは有効化しない。
現在production scanner adapterは未実装のため、`document_malware_scanner_ready=false`、
`original_document_pipeline_ready=false` を維持する。

このため、保存経路が実装された後も「保存できる = 安全確認済み」と誤判定しない。

### 回帰確認

- 旧回帰テストのstorage adapter単一判定を、新しいpipeline readiness判定へ更新
- private Blob署名処理をnetwork不要のmockで実行
- private PUT / 上書き禁止 / MIME・size制限 / private GET / cache bypassを確認
- Blob読戻しSHA-256計算を確認
- malware statusがscanner未接続時に `pending` のままであることを確認
- 最新 `fb43c44b...` GitHub Actions: **success**
- 直前 `eef4858d...` Vercel Preview: **READY**
- 最新SHAのVercel自動配備はbuild rate limitにより未反映（コード失敗ではない）

### 残る原本ブロッカー

- 承認済みproduction malware scannerの選定・接続
- scanner結果とSHA-256を結び付けたclean/blocked確定処理
- blocked/error時の隔離継続・再試行・管理者通知
- private Blob storeの実作成/接続とOIDC実接続確認
- secondary backup先への原本backup / restore / SHA-256照合
- 実PDF/画像を使わない架空原本でのend-to-end UAT

実社員原本は、上記が完了するまで投入禁止を継続する。


## 2026-09-26 scanner隔離・live readiness強化

**機能安定点:**  
`59f042e4e2f7b9e08ce31c9b474d48184e6e9b9c`

### 実装済み

- 原本処理を `quarantine pending → scanner verdict → clean only activation` の3段階へ分離
- blocked/errorでもdocuments行・SHA-256・scan時刻・監査/historyを保持
- blockedは `storage_state=blocked` で通常閲覧不可
- scanner errorはquarantine継続、active化不可
- 同一upload ticketは短い有効期間内のtransient retryに対してidempotent
- scanner adapterをprovider-neutral化
- production scannerは明示的な会社承認flag + HTTPS endpoint + 長いtokenが揃わない限りreadyにならない
- scanner送信情報を file bytes / MIME / SHA-256 / request id に限定
- 社員名・社員番号・原本ファイル名をscanner adapterから送らない
- scanner responseのSHA-256不一致、timeout、HTTP failure、malformed responseは必ずerror
- private Blob live signing probe追加
- scanner synthetic PDF live probe追加
- production readinessがlive probe失敗をblocking扱い

### CI実績

- `7667d842...`: **success**
  - Node回帰テスト
  - PostgreSQL 16 schema/capacity
  - runtime最小権限
  - backup/restore
  - 監査回帰
  - 原本契約実DB試験
  - pending → clean → active
  - blocked → durable blocked DB state
- `59f042e4...`: **success**
  - private storage signing live-probe contract
  - synthetic scanner live-probe contract

### まだ実環境で必要

- private Blob実ストア作成/接続
- approved production scanner endpoint / contract / DPA・社内承認
- 実資格情報でlive readinessを通す
- secondary backup / restore / SHA-256照合
- PC / 390px / 320px実ブラウザUAT
- VPN / 複数端末 / 複数利用者UAT

実社員情報・実原本の投入禁止は継続する。


## 2026-09-26 再々監査後・本番準備監査固定点

**監査固定SHA:**  
`909ded89fe489d738864185458deab46635ff15e`

このSHAをCODEX再監査のソース固定点とする。
以後は監査依頼資料のみ追加し、機能コードを変更する場合は固定点を改めて更新する。

GitHub Actions run `36208671483`:
- **334 tests / 334 pass / 0 fail**
- PostgreSQL実DB検証を含むworkflow成功
- 原本契約実DB検証成功
- private storage / scanner live readiness contract成功

Vercel:
- `eef4858d...` までPreview READY
- 固定SHAはVercel build rate limitにより未配備
- 固定SHAのVercel failureはコードbuild failureではなくdeployment quota
- 制限解除後に固定SHAとdeployment metadata一致を確認する

**運用判断:** 本番準備コードは大監査へ進める。実社員情報・実原本の投入は引き続き禁止。


## 2026-09-26 原本hardening追加候補

基準監査固定SHA:
`909ded89fe489d738864185458deab46635ff15e`

hardening検証SHA:
`f76867997b9b11fa10c4204a8f71a2c5bfecc1d6`

runtime実装SHA:
`2ec5c50db74fbdccad91f612354843c48f09dae0`

追加:
- PDF/JPEG/PNG magic-byte実体検証
- Content-Type偽装を `DOCUMENT_CONTENT_SIGNATURE_MISMATCH` で拒否
- scanner error監査resultをblockedと分離
- scanner endpointのURL埋込credential/query/fragmentを拒否
- hardening branchをV200 Safety Tests対象へ追加

検証:
- GitHub Actions run `36209574679`: **337/337 pass / 0 fail**
- PostgreSQL/restore/監査/原本契約を含む全step success
- Vercel runtime SHA `2ec5c50db74fbdccad91f612354843c48f09dae0`: **READY**
- deployment `dpl_2DJue4gvtFj6A4ZWnVkaYehh9jBH`
- 直近2時間runtime errors: **0**

実社員情報・実原本投入禁止は継続。


## 2026-09-26 指定利用者モデル整理

- 一般社員向け `self` / 自分 / 掲示・申請の見える導線を廃止。
- applications / notices / confirmations の旧APIルートを全環境で404化し、旧ハンドラ・専用CRUDコードも削除。
- handoffs は管理者間引継ぎとして維持。
- 新規DBは full / scoped のみ、MFA必須。
- 既存旧selfは物理削除せず、ID保持のまま suspended scoped へ移行し、セッション・scope・feature permissionを失効／解除。
- 旧workflowテーブルはrollback・監査互換のため当面保持。
- 固定点 `51462fa2bf29904bc681ce99c4bca6e355132eb0` で通常回帰、PostgreSQL、backup/restore、外部監査、原本契約、5年架空運用simulationまで GitHub Actions success。
- Vercel previewの新規生成はFreeプランのbuild rate limitにより一時制限中。コードCIとは分離して扱う。


## 2026-09-26 管理分析の本番強化

- 新規API: `GET /api/v1/analysis/management-summary`
- 安全分析に加え、現在人員、期限、資格・書類、教育・貸与品、勤務、車両の要対応集計を追加。
- 集計はfeature permission単位で隔離し、権限のない領域の集計値は返さない。
- 横断確認は人数のみ。個人ランキング、危険人物判定、退職予測は実装しない。
- 安全の部署集計は記録時所属snapshot、人員・管理系は現在所属と画面に明示。
- 分析結果から社員・期限・資格・勤務・車両・運行安全へ直接戻れる。
- `scripts/verify-management-analysis-v200.js` をCIへ追加し、PostgreSQL上で実クエリと権限隔離を検証。
- 実DB検証により既存 `safety-analysis-store.js` の月別alias `month` 構文問題を発見し修正。


## 2026-09-26 入力・更新導線の強化

- 社員詳細から事故・苦情・ヒヤリ・安全指導を、対象社員を再入力せず登録可能。
- 担当号車が1台の場合のみ事故・ヒヤリへ初期入力。複数台は自動選択しない。
- 車両詳細から事故・ヒヤリへ号車・主担当を引継ぎ。
- 車両閲覧のみ＋安全編集可の権限構成でも、安全登録だけ利用可能。
- 期限一覧から資格、書類、教育、貸与品、車両、社員の該当作業へ直接遷移。
- 既存資格・書類メタデータの更新UIを追加し、If-Match競合検知を維持。
- 期限フィルターを追加し、要対応/超過/本日/30日/31〜60日/60日全体を切替可能。
- 全社管理者向けに社員番号変更、異動・休職・退職の専用操作を社員詳細へ接続。
- 社員番号変更履歴、異動・在籍状態履歴を社員詳細へ表示。


## 2026-09-26 引継ぎワークフロー強化

- 新規API: `GET /api/v1/handoffs/targets?employee_id=...`
- 対象社員を担当できる有効な管理者だけを引継ぎ先候補として返す。自分自身は除外。
- 事故・苦情・ヒヤリから引継ぎを新規作成可能。
- 内部利用者IDの手入力は廃止し、候補選択式にした。
- 未確認引継ぎから元案件へ直接戻れる。
- 事故・苦情が閲覧のみでも、handoffs編集権限がある場合は引継ぎだけ作成可能。
- 既存の受取人限定確認、監査ログ、対象社員スコープ制約は維持。


## 2026-09-26 タクシー勤務区分・基本固定車整理

- 勤務区分表示を「日勤 / 夜勤 / 隔勤 / H勤」に統一。
- 旧「隔日勤務 / 隔日 / 午後から隔日勤務 / H勤務」は画面表示時に新呼称へ読み替える。
- タクシーの基本配置は、訓練課=日勤、1課/2課=隔勤・H勤、3課=日勤・夜勤。例外は警告後に登録可。
- 全社社員台帳のためDBでは全社員に日勤を強制しない。
- 基本固定車は勤務区分から推測せず、車両の明示設定で管理。
- 日勤・夜勤・隔勤・H勤の全区分で基本固定車を持てる。
- 事故・修理・代車時の別号車利用を許容し、実乗車号車は事故・ヒヤリ側で変更可能。
- 代車利用で基本固定車を自動変更しない。
- 勤務区分変更履歴を社員詳細に表示。

- `taxi_section` は互換用フィールドとしてDBに残し、通常UIでは非表示。事業所 + 所属部署を正式表示に統一。

- 所属・勤務・在籍変更を一本化。事業所 / 所属部署 / 勤務区分 / 在籍状態を1トランザクションで更新し、理由・MFA・If-Match・監査履歴を必須化。

- 基本固定車・担当変更履歴を車両詳細へ表示。変更前後の区分、主担当、日付、理由を確認可能。
