# V200 新仕様 60%大監査ゲート

更新日: 2026-09-26

## 新仕様

本番運用は次を前提とする。

- 社内LAN / 社内Wi-Fiのみ
- 社外回線・モバイル回線・テザリング・社外VPNは不可
- 全社員は管理対象だが、ログイン利用者は会社が指定した人だけ
- 本番利用者は full / scoped を中心とし、一般社員 self ログインは使わない
- scoped利用者は 事業所 × 課 × 機能 × 閲覧/編集 で制限
- 権限はdefault deny
- 権限UIはプリセット + 詳細調整
- 60%到達時に一度大監査
- 大監査に5年間の架空運用シミュレーションを含める
- 大監査修正後にデモを提示する

## 60%到達条件

次のA〜Hを満たした時点を「新仕様60%」とする。

### A. ネットワーク境界
- [x] production APIの社内CIDR allowlist
- [x] CIDR未設定ならproduction activation不可
- [x] 許可外IPはfail-closed
- [ ] 実社内LAN/Wi-Fiの固定グローバルIP/CIDR確定
- [ ] Vercel Trusted IPs / Firewallへ実CIDR投入

実CIDRはシステム会社確認事項であり、値が未確定でもコード監査は実施できる。
ただし本番GO条件には必須。

### B. 指定利用者方式
- [x] employeeとlogin userを分離
- [x] production loginでlegacy selfを拒否
- [x] 新規利用者はfull/scopedのみ
- [x] 指定利用者はMFA必須
- [x] suspension / retirementでsession失効
- [x] suspension / retirementでpassword resetも拒否

### C. 組織・機能権限
- [x] 事業所 × 課のuser_scopes
- [x] user_feature_permissions
- [x] view / edit
- [x] default deny
- [x] full admin implicit edit
- [x] central routerで業務APIを共通guard
- [x] 未分類business routeをテストで検出
- [ ] 主要APIのscope越境を大監査で実DB確認

### D. 見やすさ・分かりやすさ
- [x] viewer / manager / safety / customプリセット
- [x] 権限のないメニューを非表示
- [x] view-onlyは主要画面をread-only表示
- [x] edit権限だけ登録/保存操作を表示
- [ ] PC / 390px / 320pxの新権限UI実ブラウザ確認
- [ ] 60%監査後デモで3利用者パターン確認

### E. DB / 監査 / 復旧
- [x] PostgreSQL実スキーマ適用
- [x] runtime最小権限
- [x] append-only audit/history
- [x] DB dump / restore
- [x] optimistic concurrency
- [x] migration reconciliation
- [x] new permission tableをreadiness/restore検証対象に追加

### F. 原本
- [x] private storage
- [x] quarantine
- [x] malware clean only activation
- [x] MIME magic-byte
- [x] SHA-256
- [x] encrypted secondary backup
- [x] restore integrity
- [x] 404とstorage障害を分離
- [x] single-document guarded restore
- [ ] 実provider接続は本番環境ゲート

### G. 5年架空運用
- [x] dedicated fictional simulatorを実装
- [x] production起動禁止
- [x] empty dedicated DB必須
- [x] 5年負荷条件を固定
- [ ] 実PostgreSQLで5年実走success
- [ ] 5年実走JSONを大監査資料へ添付

標準5年負荷:
- 初期310名
- 入社50名/年
- 退職30名/年
- ヒヤリ400件/月
- 事故20件/月
- 苦情20件/月（監査ストレス条件）
- 社員番号変更12件/年
- 異動10件/年
- 指定利用者30名

### H. 60%大監査
60%到達後は機能追加を一旦停止し、以下を実施する。

1. 全Node回帰テスト
2. PostgreSQL 16実適用
3. 権限・scope越境
4. internal-network拒否
5. login/MFA/session/password reset
6. 最後のfull admin保護
7. work-import transaction/rollback
8. audit append-only
9. private original fail-closed
10. encrypted backup/restore
11. DB dump/restore
12. 5年間架空運用
13. 障害系:
   - VERSION_CONFLICT
   - scanner blocked/error/timeout/hash mismatch
   - storage 404/403/5xx
   - backup欠損/改ざん
   - 管理者停止/退職
   - 権限縮小session失効
   - 社外IP拒否
14. PC / 390px / 320px UI確認
15. CODEX差分大監査

Critical / Highを修正し、Mediumは本番前必須かを分類する。

## 監査後デモ

監査修正後、架空データで次の3人を切り替えて提示する。

### 1. 全社管理者
- 全事業所
- 全課
- 全機能
- 編集可
- 利用者管理可

### 2. 本社タクシー課 管理担当
- 本社・タクシー1課
- 社員/事故/苦情/ヒヤリ等
- 担当機能のみ編集可
- 範囲外社員を表示しない

### 3. 府中タクシー課 閲覧担当
- 府中・タクシー2課
- 許可機能のみ表示
- 登録/保存/完了ボタンなし
- API直接操作も拒否

デモはproduction承認ではない。
実社員情報・実原本は使用しない。
