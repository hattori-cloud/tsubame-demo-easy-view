# index.html 安全分割計画 — V200

更新日: 2026-09-24

## 目的

現在の index.html は画面、CSS、架空データ、保存、権限、分析、監査、フォーム処理を1ファイルに集約しているため、1か所の変更が起動全体へ波及しやすい状態です。

ただし全面分割は行いません。現行挙動を固定したまま、依存が少ない部分から段階的に外へ出します。

## 原則

- 1回のPRで1領域だけ切り出す
- 切り出し前後で既存テストを全件通す
- 起動時例外0を必須にする
- full / scoped / self の権限挙動を変えない
- localStorageキーを切り出し作業中に変更しない
- 関数名とHTML側onclick契約を当面維持する
- 実社員データは使用しない
- 本番API化とUI分割を同じ変更で行わない

## 分割順序

### Phase 1 — 定数・純粋関数

候補:
- 日付・文字列正規化
- esc()
- days()
- nextRecordId()
- ラベル変換
- 分析用の純粋な集計関数

理由:
DOM、localStorage、権限状態への依存が比較的小さいため、最も安全に切り出せます。

### Phase 2 — 保存・復旧

候補:
- coreSaveItems()
- captureCoreSaveSnapshot()
- verifyCoreSave()
- rollbackCoreSave()
- revision / recovery-required 管理
- storage event競合検知

注意:
ここはデータ消失に直結するため、起動テスト・保存失敗注入・rollback失敗・別タブ競合テストを先に固定します。

### Phase 3 — 権限

候補:
- ACCESS_POLICY
- canAccess()
- grantedEmployees()
- scopedEmployees()
- guardEmployeeView/Edit()
- guardManagementRecord()

注意:
フロント側権限はデモ表示制御です。本番認可はAPI側を正とします。

### Phase 4 — 業務ドメイン

順番:
1. 社員
2. 車両
3. 事故
4. 苦情
5. ヒヤリ
6. 資格・書類
7. 期限
8. 研修・貸与品・面談

各領域で render / detail / openForm / validation / next-action を同じモジュールへまとめます。

### Phase 5 — 分析

候補:
- 安全月次
- ヒヤリ傾向
- 全社横断
- 人員構成
- 総務
- 教育・貸与品

分析は入力元の業務データが安定してから分割します。

### Phase 6 — boot

最後に:
- runBootMigrations()
- renderAll()
- RELEASE_VERSION
- 初期role適用
- 起動診断

起動順序に関わるコードは最後まで index.html 側に残し、TDZ・未初期化・依存順事故を避けます。

## 推奨ファイル構成

- js/core-utils.js
- js/storage.js
- js/access.js
- js/navigation.js
- js/employees.js
- js/vehicles.js
- js/safety-accidents.js
- js/safety-complaints.js
- js/safety-near.js
- js/credentials-documents.js
- js/deadlines.js
- js/analysis.js
- js/boot.js

CSSはJavaScript分割が安定してから別工程で分離します。

## 各Phaseの合格条件

- npm test 全件成功
- inline JavaScript構文正常
- runtime exception 0
- ホーム表示
- 社員一覧表示
- 社員詳細遷移
- 事故 / 苦情 / ヒヤリ画面遷移
- full / scoped / self 権限確認
- 保存・再読込
- 390px表示確認
- production gateの停止条件維持

## 今は実施しないこと

- React等への全面移植
- localStorageからDBへの同時移行
- 画面デザイン全面変更
- 関数名の大量変更
- onclick契約の一括廃止
- 本番認証導入とUI分割の同時実施

まず回帰を減らすことを目的にします。
