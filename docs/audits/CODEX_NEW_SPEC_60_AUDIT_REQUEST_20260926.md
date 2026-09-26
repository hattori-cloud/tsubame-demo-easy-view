# CODEX V200 新仕様60% 大監査依頼

更新日: 2026-09-26

## 監査対象

リポジトリ:
`hattori-cloud/tsubame-demo-easy-view`

対象ブランチ:
`audit-v200-new-spec-60-fixed`

**コード固定SHA:**
`197480ab30dcbfa05fd7103d81e06d02be7939e1`

このSHAを動かさず監査してください。

## 新仕様

本番は以下へ変更した。

- 社内LAN / 社内Wi-Fiのみ利用可
- 自宅回線、モバイル回線、テザリング、社外Wi-Fi、社外VPNは不可
- 全社員は管理対象だがログイン利用者は会社指定者のみ
- 本番利用者は full / scoped
- legacy selfは本番login不可
- scopedは 事業所 × 課 × 機能 × view/edit
- default deny
- UIはviewer / manager / safety / custom preset + 詳細調整
- 権限変更時は既存sessionを失効

## 内部監査実績

GitHub Actions run:
`36215987334`

- **378 / 378 tests pass**
- PostgreSQL 16 schema実適用
- distributed login rate limit
- runtime least privilege
- work-import transaction/rollback
- migration reconciliation
- optimistic concurrency
- pg_dump / pg_restore
- external audit regressions
- private original contract
- encrypted secondary backup/restore
- 5-year fictional operation

## 5年実走

期間:
2027-01-01 ～ 2031-12-31

条件:
- 初期社員 310
- 入社 50/年
- 退職 30/年
- ヒヤリ 400/月
- 事故 20/月
- 苦情 20/月
- 社員番号変更 12/年
- 異動 10/年
- 指定利用者 30

結果:
- employees 560
- active 410
- retired 150
- near_misses 24,000
- accidents 1,200
- complaints 1,200
- employee_number_history 60
- audit_logs 26,425
- record_histories 200
- users 30
- user_feature_permissions 225

全invariant true。

代表クエリ:
- employee number lookup 0.4ms
- latest near misses 7.98ms
- monthly safety aggregate 10.51ms
- scope filtered accidents 0.59ms

性能値はCI環境値であり本番性能保証ではない。

## 内部監査で発見・修正済み

### M01 Medium / Fixed
legacy self sessionが新規login禁止後もcommon auth endpointへ到達できる余地。

修正:
- authenticateRequestで active / non-retired / non-self を毎回再確認
- 不適格sessionはgeneric 401
- 旧self sessionをDBへ直接再現する監査ケース追加

### T01 Test / Fixed
scoped audit fixtureに新feature permissionが不足。
必要最小限のpermissionを明示付与。

### T02 Test / Fixed
5年simulatorのrecord_histories INSERTでtext/uuid型競合。
明示castで修正。

## CODEX重点監査

以下を重大度順に確認してください。

1. internal-network boundary
   - app CIDR判定のfail-open
   - x-forwarded-for扱い
   - CIDR未設定時activation
   - 社外アクセス時の情報漏えい
2. selected-user model
   - self bypass
   - legacy session bypass
   - suspended/retired session
   - password reset/change
   - MFA challenge
3. full/scoped authorization
   - office × department越境
   - feature view/edit越境
   - API直叩き
   - mixed drafts
   - unclassified route
4. permission lifecycle
   - full→scoped
   - scope縮小
   - view→edit / edit→view
   - session失効
   - last active full admin
5. data history
   - immutable employee UUID
   - employee number change
   - transfer/retirement
   - historical snapshot
6. work import
   - ownership
   - version
   - rollback
   - concurrent update
7. original documents
   - MIME spoof
   - quarantine
   - malware clean-only activation
   - scanner hash binding
   - blocked/error
   - backup encryption
   - restore hash/size/MIME
8. audit
   - append-only
   - scope/permission changes
   - auth events
9. five-year simulator
   - unrealistic assumptions
   - missing lifecycle scenarios
   - count/invariant weakness
   - performance query weakness
10. production UI
   - hidden menu != authorization dependency
   - view-only mutation buttons
   - preset mistakes
   - 320/390/PC layout risks

## 実環境ブロッカーとして分離するもの

次はコード不具合と混同しないでください。

- 実社内LAN/Wi-Fi固定グローバルIP/CIDR未確定
- Vercel Trusted IPs / Firewallへ実CIDR未投入
- static production画面のedge protection実確認
- production private Blob実接続
- approved malware scanner実接続
- secondary backup実接続
- 本番PostgreSQL / auth / MFA
- 実社員migration manifest
- PC / 390px / 320px実ブラウザUAT
- 社内LAN/Wi-Fi実接続UAT
- 自宅/モバイル/テザリング/社外VPN拒否UAT

## 禁止

- 実社員情報を監査用に作らない
- 実原本を使わない
- office CIDRを推測しない
- VPNを許可経路へ変更しない
- selfを本番利用者へ戻さない

## 報告形式

各指摘:
- Critical / High / Medium / Low
- ファイル / 関数
- 再現手順
- 実害
- 原因
- 最小修正案
- 固定SHAで再現するか
- コード不具合か実環境ブロッカーか

最後に:
1. 60%以降へ進む前に必須修正
2. 本番環境接続時に確認
3. 本番後でもよい改善

の3区分でまとめてください。
