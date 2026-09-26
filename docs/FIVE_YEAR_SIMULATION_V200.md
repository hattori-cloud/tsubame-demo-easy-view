# V200 5年間 架空運用シミュレーション

更新日: 2026-09-26

## 目的

新仕様の60%大監査で、単発の画面確認だけではなく5年間の継続運用を再現する。

実社員情報・実原本は使用しない。

## 安全条件

- productionではスクリプト自体が起動拒否する。
- `TSUBAME_FIVE_YEAR_SIMULATION=1` が必要。
- 社員0件の専用空DBでのみ実行する。
- 社員名・番号はすべて `架空社員` / `SIM-`。
- 本番DB、実原本ストレージへ接続しない。

## 標準負荷

5年間（2027-01-01〜2031-12-31）を標準ケースとする。

- 開始社員: 310名
- 毎年入社: 50名
- 毎年退職: 30名
- 月間ヒヤリ: 400件
- 月間事故: 20件
- 月間苦情: 20件（監査用ストレス条件）
- 毎年社員番号変更: 12件
- 毎年異動: 10件
- 指定利用者: 30名
- 一般社員/self利用者: 0名

5年後の標準期待値:

- 社員総数: 560
- 現役: 410
- 退職履歴: 150
- ヒヤリ: 24,000件
- 事故: 1,200件
- 苦情: 1,200件
- 社員番号変更履歴: 60件

## 監査すること

1. immutable employee IDを維持したまま社員番号変更できる。
2. 退職者を削除せず履歴として保持する。
3. 異動後も事故・苦情・ヒヤリの記録時所属snapshotが変わらない。
4. 指定利用者はfull/scopedだけでself利用者が存在しない。
5. scoped利用者の機能別view/edit権限が蓄積後も保持される。
6. 5年間で社員番号重複が発生しない。
7. 大量のヒヤリデータでも月次集計・最新一覧・scope集計が実行できる。
8. audit/historyの追跡情報が残る。
9. 代表クエリが監査環境で5秒を超えない。
10. 原本については別のprivate storage / malware / encrypted backup / restore E2E監査と組み合わせる。

## 実行

専用DBへproduction schemaを適用した後:

`TSUBAME_FIVE_YEAR_SIMULATION=1 node scripts/simulate-five-years-v200.js`

結果はJSONで出力し、60%大監査資料へ添付する。

## 60%大監査で追加する障害試験

正常5年運用後、別途以下を実施する。

- 同時更新 / VERSION_CONFLICT
- scanner timeout / blocked / SHA mismatch
- private storage 404 / 403 / 5xx
- encrypted backup欠損 / 改ざん / restore hash mismatch
- 管理者停止・退職
- 権限縮小後のsession失効
- 社外IPアクセス拒否
- 勤務取込rollback
- DB dump/restore

正常系だけで合格にしない。
