# V200 本番導入・切替ランブック

更新日: 2026-09-26

## 目的

本書は、つばめ交通 社員一元管理システム V200 を実社員データへ切り替える際の標準手順を定める。

原則:
- 実社員データ・実原本を、環境準備・復元試験・UATより先に投入しない。
- production business APIはreadinessが全合格するまで有効化しない。
- 問題があれば「修正しながら本番継続」ではなく、切替を止めて直前の安全点へ戻す。
- 本番開始承認と技術的に起動できる状態を同一扱いしない。

## 0. 役割分担を決める

本番作業開始前に最低限、次の担当を氏名で決める。

- 業務責任者: 本番開始/延期判断
- システム責任者: アプリ・DB・storage構成承認
- DB担当: PostgreSQL、backup/restore
- network担当: VPN/IP/社内アクセス
- identity担当: account/MFA
- storage担当: private original storage/secondary backup
- scanner担当: malware scanner
- データ移行担当: migration/reconciliation
- UAT責任者: PC/390px/320px/複数利用者確認

一人が複数担当してもよいが、本番開始判断と技術確認を一人だけに依存させない。

## 1. 本番環境作成

### 1-1 PostgreSQL

確認:
- production PostgreSQL 16互換
- DB接続暗号化
- `tsubame_app_runtime` 最小権限role
- migration用roleとruntime roleを分離
- backup先を本番DBと別障害領域に配置
- restore用の隔離/staging DBを用意

適用順序は `docs/production-sql-apply-order-v200.md` を使用する。

### 1-2 認証

確認:
- ID + 現社員番号 + password
- MFA
- session secret
- MFA encryption key
- account lifecycle
- retired/suspended userのsession拒否
- 最後のactive full admin保護

本番利用者の初期登録前に、管理者2名以上を確保する。

### 1-3 private原本storage

確認:
- private access
- short-lived signed authorization
- permanent public URLなし
- opaque storage key
- PDF/JPEG/PNGのみ
- size limit
- SHA-256
- overwrite禁止
- quarantine

### 1-4 malware scanner

確認:
- 承認済みprovider
- HTTPS endpoint
- endpoint URLにcredential/query/fragmentなし
- tokenはheaderのみ
- timeoutあり
- redirect拒否
- response SHA-256 binding
- clean / blocked / error区別

### 1-5 secondary original backup

確認:
- primary object storageと別障害領域
- company approval済み
- HTTPS private transport
- backup専用token
- 32-byte backup encryption key
- AES-256-GCM encrypted backup
- restore SHA-256 verification
- live synthetic backup/restore probe

## 2. production activation前チェック

production business data activation flagは、以下がすべて完了するまでONにしない。

実行:
`node scripts/check-production-readiness-v200.js`

合格条件:
- auth ready
- PostgreSQL live connection
- production schema ready
- append-only audit/history
- near-miss capacity
- distributed login rate limit
- work-import persistence
- runtime least privilege role
- private storage live signing
- malware scanner synthetic clean probe
- original pipeline ready
- separate-domain backup ready
- encrypted backup synthetic restore probe
- activation flag

1つでもblockerがあれば本番開始しない。

readiness出力にsecret値が含まれていないことも確認する。

## 3. 架空データ本番同等UAT

実社員データを入れる前に、本番構成へ架空社員を使用して実施する。

### 認証
- 正常login
- 社員番号誤り
- password誤り
- MFA誤り
- MFA replay
- suspended
- retired
- session expiration

### 権限
- full
- scoped
- self
- office × department越境拒否
- strict document MFA
- owner/handoff範囲外拒否

### 業務
- 社員検索/詳細/編集
- 社員番号変更
- 事故
- 苦情
- ヒヤリ
- 期限
- 資格/書類
- 車両
- safety analysis
- work import preflight/commit/rollback
- stale update VERSION_CONFLICT

### 画面
- PC
- 390px
- 320px
- Chrome系
- 実運用で指定されるbrowser

## 4. 架空原本E2E

実社員原本はまだ使用しない。

確認:
1. synthetic PDF upload ticket
2. private quarantine upload
3. actual byte MIME signature
4. SHA-256
5. scanner clean
6. DB clean記録
7. active化
8. short-lived download
9. backup暗号化
10. secondary write
11. restore
12. SHA-256/size/MIME一致
13. audit/history

negative:
- MIME偽装
- malware blocked
- scanner error
- scanner SHA mismatch
- backup改ざん
- backup欠損
- restore SHA mismatch

すべてfail-closedを確認する。

## 5. DB backup/restore rehearsal

本番開始前にproduction候補DBのbackupを作成する。

別DBへrestore後:
- table/schema
- FK
- index
- append-only trigger
- least privilege
- active full admin
- employee UUID
- employee number history
- near-miss monthly targets
- work import batches/history
- audit/history

を再検証する。

単に「backup job成功」で合格としない。

## 6. 実データ移行準備

実データをDBへ書く前にmigration manifestを作成する。

最低項目:
- expected employee count
- active / retired count
- immutable employee IDs
- current employee numbers
- old employee number history
- office
- department
- employment type
- reference counts

社員番号は永続IDとして扱わない。immutable employee UUIDを本体キーとする。

社員番号再利用の可否は会社決裁ルールとし、システム側で推測しない。

## 7. 実社員データ移行

推奨:
1. 本番業務利用停止状態で実施
2. migration roleでimport
3. runtime roleではmigrationを行わない
4. import完了後にreconciliationを実行
5. 差異0または承認済みwarningのみで次へ進む

実行:
`node scripts/reconcile-production-migration-v200.js`

確認:
- orphan 0
- duplicate current employee_no 0
- employee number latest mismatch 0
- broken references 0
- active full admin >=1
- expected manifestとの一致

不一致があればactivationしない。

## 8. 限定利用

最初から全社員へ開放しない。

推奨:
- 全社管理者
- タクシー部門管理者
- 別部門管理者
- self利用者

を各1名以上選び、本番データで閲覧中心の確認を行う。

この段階で確認:
- scope
- employee detail
- deadline
- accident/complaint/near-miss
- work import
- original access
- audit log

## 9. 並行運用

業務停止影響の大きい項目は旧運用と短期間比較する。

重点:
- 社員台帳
- 期限
- 事故
- 苦情
- ヒヤリ
- 勤務集計

件数・対象者・月次結果を比較する。

差異があれば旧運用を即廃止しない。

## 10. 本番切替判定

GO条件:
- CODEX重大指摘解消
- production readiness全合格
- DB backup/restore合格
- original backup/restore合格
- migration reconciliation合格
- PC/390px/320px UAT合格
- VPN/複数端末/複数利用者合格
- 管理者権限確認
- rollback手順確認

NO-GO:
- Critical/High未解消
- backup未検証
- scanner不安定
- DB照合差異
- scope越境
- active full admin 0になる可能性
- 実原本復元未確認
- Vercel deployment SHA不一致

## 11. 本番activation

直前に:
1. Git SHAを記録
2. Vercel deployment metadataのSHA一致確認
3. DB backup取得
4. restore可能性確認
5. readiness再実行
6. active full admin確認
7. migration reconciliation再実行

その後、承認者の判断でproduction activation flagを有効化する。

activation後すぐ:
- health
- login
- MFA
- employee list
- scope
- audit
- representative read/write
を確認する。

## 12. rollback条件

以下は即rollback候補:
- login不能
- scope漏えい
- employee UUID/番号誤紐付け
- writeデータ消失
- audit記録不能
- private originalが権限外閲覧可能
- scanner fail-open
- backup/restore不整合
- DB corruption

rollback:
1. production activation停止
2. write停止
3. 問題時刻記録
4. deployment SHA記録
5. DB backup保全
6. 必要に応じ直前DB restore
7. old operationへ戻す
8. 原因調査
9. 再度full readiness/UAT後に再開

データ不整合時は、安易に直前backupへ上書きrestoreせず、事故時点DBを必ず保全する。

## 13. 本番開始後

初期期間は毎日確認:
- auth failure
- login limiter
- API errors
- DB errors
- scanner error
- blocked originals
- backup failure
- audit append failures
- work import errors
- deadline notifications

定期:
- DB restore test
- object restore test
- SHA-256 comparison
- access review
- admin account review
- retention review
- incident drill

## 14. 本番開始承認記録

最低限記録:
- approved Git SHA
- Vercel deployment id
- DB schema revision
- migration manifest hash
- reconciliation result
- DB backup id/time
- object backup restore result
- readiness result
- UAT sign-off
- approval date
- approver

この記録がない状態を「なんとなく本番開始」にしない。
