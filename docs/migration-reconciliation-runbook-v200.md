# V200 社員データ移行・照合手順

更新日: 2026-09-25

## 原則

実社員データは、本番認証・本番DB・権限・backup/restore・UATが整う前に投入しない。

移行は「入ったように見える」ではなく、投入前後の件数・一意性・参照整合を照合して完了とする。

## 1. 事前準備

- source systemを読取専用化またはcutoff時刻を決める
- source exportにbatch idを付ける
- export時刻・件数・hashを記録
- 原本ファイルとmetadata移行は別工程
- 社員番号をDB主キーにしない
- immutable employee UUIDを基準にする

## 2. 社員マスタ照合

必須集計:
- 総社員数
- 在籍
- 休職
- 退職予定
- 退職
- office別
- department別
- employment区分別

照合キー:
- source record id
- immutable employee UUID
- current employee number

禁止:
- 氏名だけで同一人物判定
- 同姓同名の自動統合
- 不明データの推測補完

## 3. 社員番号履歴

各社員:
- current employee_no は1つ
- old employee_noは0件以上
- current employee_no重複 0
- old numberが別社員のcurrent numberと衝突する場合は要人手確認
- renumber後もemployee UUIDは不変

サンプリングではなく全件照合する。

## 4. 利用者アカウント

- user.employee_idが存在する
- 退職者のactive account 0
- active full administrator 1名以上
- full/scoped/self role件数
- scoped userのoffice × department
- orphan user 0

password hashやMFA secretそのものを照合資料へ出さない。

## 5. 業務参照

全件参照確認:
- qualification → employee
- document → employee
- document → qualification
- vehicle → primary employee
- vehicle_users → employee
- accident → employee
- complaint → employee
- near_miss → employee
- guidance → employee
- application → employee
- handoff → user

期待値:
- orphan reference 0
- cross-employee qualification/document 0
- out-of-scope assignmentは業務上の共用車両ルール以外0

## 6. 安全記録履歴

事故・苦情・ヒヤリは「現在所属へ付け替える」のではなく、記録時snapshotを保持。

照合:
- office_at_record
- department_at_record
- employment_at_record
- car_no
- occurred/responded date
- employee UUID

## 7. 車両

- car_no unique
- active assignmentの重複制約違反0
- primary / additional assignment照合
- 廃車状態
- inspection due
- maintenance due

同日解除→再割当履歴が失われていないことを確認する。

## 8. 月次ヒヤリ

移行月ごとに:
- target snapshot件数
- exempt件数
- near miss報告件数
- zero / short / met / exempt件数

現在社員数から過去月targetを再計算しない。

## 9. 監査ログ・履歴

移行前のlegacy履歴を取り込む場合:
- sourceを明示
- actor不明を架空userへ割り当てない
- unknown actorは専用のmigration markerで扱う
- original timestamp保持
- import batch id保持

本番移行後のaudit_logs / record_historiesはappend-only。

## 10. 移行照合レポート

最低記録:
- batch id
- source export時刻
- source件数
- destination件数
- rejected件数
- warning件数
- orphan件数
- duplicate件数
- before/after aggregate
- approver
- 実行者
- rollback可否

## 11. 合格条件

- 社員総数一致
- lifecycle集計一致
- current employee number重複0
- orphan 0
- cross-employee reference 0
- user/account不整合0
- vehicle active assignment制約違反0
- safety snapshot欠損0
- rejected recordが全件説明可能

不明値を勝手に補完して合格扱いにしない。
