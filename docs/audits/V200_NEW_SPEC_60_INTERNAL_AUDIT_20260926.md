# V200 新仕様 60% 内部大監査結果

監査日: 2026-09-26

## 監査固定点

監査開始固定点:
`7f560e251be130d3b4aa4b6aac7a046fddbebe32`

監査修正済み固定点:
`197480ab30dcbfa05fd7103d81e06d02be7939e1`

固定ブランチ:
`audit-v200-new-spec-60-fixed`

## 結論

新仕様のコード側60%節目として、内部大監査を完了した。

最新CI:
- run `36215987334`
- **378 tests / 378 pass / 0 fail**

今回の内部監査では、修正前固定点に対して新しいCritical / Highは確認されなかった。
Medium相当の認証境界1件を発見し、監査中に修正済み。
テスト/監査実装上の不整合も修正済み。

これは本番開始承認ではない。
実社内LAN/Wi-Fi CIDR、Vercel Trusted IPs / Firewall、本番provider、実ブラウザUAT、実データ移行、CODEX差分監査は別ゲート。

## 新仕様確認

### 社内ネット限定

実装済み:
- production API CIDR allowlist
- CIDR未設定ならproduction business activation不可
- 許可外IPは404 fail-closed
- Vercelのclient IPヘッダ仕様を前提に送信元判定

本番前必須:
- 社内LAN/Wi-Fiの固定グローバルIP/CIDR確定
- Vercel Trusted IPs / Firewall設定
- 静的production画面もedgeで社外遮断

禁止:
- 自宅回線
- モバイル回線
- テザリング
- 社外Wi-Fi
- 社外VPN

### 指定利用者のみ

- employee全員は管理対象
- login userは会社が指定した利用者のみ
- full / scopedのみ新規発行
- selfの新規login禁止
- legacy self sessionも共通認証層で401
- MFA必須
- suspended / retiredを共通認証層で401
- password resetも停止/退職を拒否

### 権限

- full: 全社編集権限
- scoped: 事業所 × 課
- 機能別 `view / edit`
- default deny
- 未分類business routeをCIで検出
- 権限変更時は既存session失効
- UIはpreset + 詳細設定
- view-onlyは登録/保存操作を非表示

## 監査で発見・修正した事項

### M01 / Medium / Fixed
**旧self sessionが共通認証APIへ残存到達できる可能性**

新規login/createSessionはselfを拒否していたが、仕様変更前に作られた既存session行は `authenticateRequest` 単体ではrole/state/lifecycleを再確認していなかった。

影響:
- 業務APIは中央feature guardで拒否される
- ただし `/me` やpassword change等の共通認証系へ到達する余地があった

修正:
- `authenticateRequest` で state active / 非retired / 非self を毎回確認
- 不適格sessionはgeneric 401
- 旧self sessionをDBへ直接再現する実DB監査ケースへ強化

修正SHA:
`197480ab30dcbfa05fd7103d81e06d02be7939e1`

### T01 / Test / Fixed
scoped監査fixtureが新しいfeature permissionを持っておらず、旧scope監査が403になった。
必要最小限の `vehicles=edit / deadlines=view` だけを明示付与して、新しいdefault-denyモデルの上でscope監査を継続。

### T02 / Test / Fixed
5年シミュレータのrecord history INSERTで、entity_id(text)とemployee_id(uuid)に同じ未型指定parameterを使用しPostgreSQLが拒否。
`::text / ::uuid` を明示して修正。

## 5年間架空運用シミュレーション

期間:
**2027-01-01 ～ 2031-12-31**

入力条件:
- 初期社員 310名
- 入社 50名/年
- 退職 30名/年
- ヒヤリ 400件/月
- 事故 20件/月
- 苦情 20件/月
- 社員番号変更 12件/年
- 異動 10件/年
- 指定利用者 30名

5年後:
- employees: **560**
- active: **410**
- retired: **150**
- near_misses: **24,000**
- accidents: **1,200**
- complaints: **1,200**
- employee_number_history: **60**
- audit_logs: **26,425**
- record_histories: **200**
- users: **30**
- user_feature_permissions: **225**

全invariant:
- employee total: true
- active/retired count: true
- near-miss/accident/complaint volume: true
- employee-number history: true
- self users 0: true
- snapshot missing 0: true
- duplicate current employee number 0: true
- 異動後も過去所属snapshot保持: true
- permission rowsあり: true
- audit rowsあり: true
- representative queries < 5 sec: true

代表クエリ:
- employee number lookup: **0.4 ms**
- latest near-misses: **7.98 ms**
- monthly safety aggregate: **10.51 ms**
- scope-filtered accidents: **0.59 ms**

この性能値はCI用PostgreSQL上の架空データ結果であり、本番インフラの性能保証ではない。

## 大監査で合格した領域

- Node regression
- PostgreSQL 16 schema
- feature permission schema
- selected-user login model
- login/MFA/session/password reset
- full/scoped scope enforcement
- central business feature guard
- last full admin continuity
- distributed login rate limiting
- work-import preflight/commit/rollback
- VERSION_CONFLICT
- migration reconciliation
- append-only audit/history
- pg_dump / pg_restore
- private original quarantine
- malware clean-only activation
- MIME magic-byte
- SHA-256 binding
- encrypted secondary original backup
- restore integrity
- missing-vs-storage-failure distinction
- guarded single-document restore
- 5-year fictional operation

## 大監査後も未完了

コード不具合ではなく実環境/受入ゲート:
1. 実社内LAN/Wi-Fi固定グローバルIP/CIDR確定
2. Vercel Trusted IPs / Firewallへ実CIDR投入
3. 社外回線・モバイル・テザリング・社外VPNの実拒否試験
4. PC / 390px / 320px 実ブラウザUAT
5. production private Blob実接続
6. approved malware scanner実接続
7. secondary backup実接続
8. 本番PostgreSQL / auth / MFA実接続
9. 実社員migration manifest / reconciliation
10. CODEX差分大監査

実社員情報・実原本はまだ投入しない。

## 次工程

1. 監査修正済みPreviewをデモ用に確認
2. 全社管理者 / scoped編集 / scoped閲覧の3パターンをデモ
3. CODEXへ60%差分監査資料を渡す
4. 60%以降の開発を再開
