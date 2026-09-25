# V200 実機UAT手順

更新日: 2026-09-25

## 目的

自動テストでは確認できない「見やすさ・わかりやすさ・実際の操作」を本番前に確認する。

## 1. 対象端末

最低:
- PC 1366px以上
- PC 1920px
- mobile 390px
- mobile 320px
- iPhone実機
- Android実機

ネットワーク:
- 社内LAN
- VPN
- 通常モバイル回線（production公開条件に合う場合のみ）

## 2. 役割

最低3アカウント:
- full administrator
- scoped manager
- self/general employee

実社員情報を使わないstagingでは架空アカウント。

## 3. ホーム

確認:
- 今日の優先対応が理解できる
- 社員検索
- 旧社員番号検索
- 号車検索
- 事故番号検索
- 名前クリックで社員詳細
- 「戻る」で一覧位置へ戻る
- 文字切れ/横スクロール/重なりなし

## 4. 社員

- 新規登録
- 詳細
- 編集
- 社員番号変更
- 旧番号検索
- 退職予定
- 退職
- last full admin拒否
- 退職後ログイン拒否

## 5. 安全

事故:
- 新規
- 更新
- 同時編集
- complete
- completed後通常編集拒否
- reopen

苦情:
- 新規
- rank
- guidance
- owner
- due
- complete
- 完了済み通常編集拒否
- 理由付き再開
- 再開理由表示/監査

ヒヤリ:
- 新規
- 月次集計
- zero/short/met/exempt

## 6. 車両

- 一覧
- 号車検索
- 氏名検索
- 社員番号検索
- detail
- primary/additional driver
- 同日再割当
- inspection due
- maintenance due
- scoped managerからscope外社員情報が見えない
- deadline経由でもscope外社員情報が見えない

## 7. 認証

- login
- wrong password
- lockout
- MFA first enrollment
- MFA verify
- MFA replay拒否
- password change
- password reset
- old password concurrent login拒否
- logout
- session expiry
- suspended user拒否
- retired user拒否

## 8. 同時操作

端末A/端末B:
- 同じ事故を同じversionで編集
- 1成功 / 1 conflict
- last full admin 2人を同時退職
- 1成功 / 1拒否
- employee renumber中に他画面参照
- old tabから保存

## 9. 期限センター

- 社員期限
- 車両期限
- scoped manager
- self user
- click遷移
- 対応後一覧復帰
- scope外情報漏えいなし

## 10. 分析

- 部署filter
- 雇用区分filter
- 年度開始日
- JSTで3/31混入なし
- 安全分析から元案件へ遷移
- filter状態維持

## 11. 勤務取込

- 1900 date system
- 1904 date system
- duration
- invalid row
- preview
- commitは本番経路実装後のみ実施

## 12. アクセシビリティ/視認性

- ボタンが押せる大きさ
- 表が画面外へ切れない
- modalが閉じられる
- tab移動
- keyboard focus
- errorが日本語で理解できる
- 保存後に何が起きたか分かる
- destructive actionに確認がある

## 13. 不具合記録

各件:
- UAT ID
- device
- browser
- role
- page
- operation
- expected
- actual
- screenshot
- severity
- fixed SHA
- retest result

## 14. 合格条件

本番前:
- Critical 0
- High 0
- business-blocking Medium 0
- mobile主要導線完走
- PC主要導線完走
- scoped/selfで情報漏えい0
- concurrent edit安全
- auth critical flow完走
