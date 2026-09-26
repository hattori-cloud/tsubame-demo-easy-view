# CODEX hardening差分監査依頼 — V200 原本セキュリティ追加強化

更新日: 2026-09-26

## 1. 監査対象

基準固定点:
`909ded89fe489d738864185458deab46635ff15e`

hardening検証SHA:
`f76867997b9b11fa10c4204a8f71a2c5bfecc1d6`

runtime実装SHA:
`2ec5c50db74fbdccad91f612354843c48f09dae0`

対象ブランチ:
`post-audit-v200-hardening-next`

基準固定点からhardening検証SHAまでは3コミット、behind 0です。
変更領域は原本セキュリティ、監査表現、hardening branch CI対象追加、監査資料のみです。

## 2. 今回追加した安全強化

### A. 原本MIME偽装対策

従来はprivate BlobのHEAD `Content-Type` と許可MIMEを確認していましたが、
保存実体の先頭バイトを見てPDF/JPEG/PNGの実ファイル署名を確認する処理を追加しました。

許可判定:

- PDF: `%PDF-`
- JPEG: `FF D8 FF`
- PNG: `89 50 4E 47 0D 0A 1A 0A`

宣言MIMEと検出実体が一致しない場合:

`DOCUMENT_CONTENT_SIGNATURE_MISMATCH`

でfail-closedします。

private Blob読戻し時とCI memory upload双方で同じ検証を通します。

### B. scanner audit resultの意味修正

scanner verdict:

- clean → audit result `success`
- blocked → audit result `blocked`
- error → audit result `error`

へ統一しました。

以前はerrorもblockedとして監査resultへ入るため、
「危険物検出」と「検査系障害」が監査集計上区別しにくい状態でした。

### C. scanner URL設定強化

production scanner endpointは引き続きHTTPS必須です。

さらに次を含むURLはreadiness falseとしました。

- URL embedded username/password
- query string
- fragment

scanner tokenはAuthorization headerだけで送る設計を維持し、
URLやログへsecretを載せる設定を防ぎます。

### D. CI blocked fixtureの整合

MIME実体検証追加後もblocked経路を実DBで試験できるよう、
blocked架空原本を有効なPDF signature付きfixtureへ変更しました。

## 3. 検証実績

GitHub Actions run:
`36209574679`

結果:

- **337 tests / 337 pass / 0 fail**
- PostgreSQL 16 schema/capacity: success
- distributed login rate limiter: success
- runtime least privilege role: success
- work-import transaction lifecycle: success
- migration reconciliation: success
- optimistic concurrency: success
- pg_dump / pg_restore: success
- external audit regression: success
- private document storage contract: success

Vercel Preview:

runtime実装SHA `2ec5c50db74fbdccad91f612354843c48f09dae0`:
**READY**

deployment id:
`dpl_2DJue4gvtFj6A4ZWnVkaYehh9jBH`

preview URL:
`tsubame-demo-easy-view-i2xjfbruz-hattori-6341.vercel.app`

直近2時間 runtime errors:
**0**

`f76867997b9b11fa10c4204a8f71a2c5bfecc1d6` はCI workflow対象追加だけが `2ec5c50db74fbdccad91f612354843c48f09dae0` から増えたSHAで、
runtime application codeは同一です。

## 4. CODEXに再確認してほしい点

1. magic-byte判定が過不足なくfail-closedか
2. Content-Type偽装でscanner/activationへ進めないか
3. JPEG/PNG/PDF判定の境界ケース
4. scanner errorとblockedの監査result区別
5. scanner endpoint URLへsecretを埋め込む設定がreadyにならないか
6. 今回変更により既存clean/blocked/error retryが壊れていないか
7. private Blob readback SHA-256 contractとの整合
8. 実ファイル内容をログへ出す経路が増えていないか

## 5. 既知の実環境ブロッカー

今回も次は未完了です。

- production private Blob実資格情報
- approved scanner実endpoint
- DPA / 社内承認
- 本番PostgreSQL実接続
- 実会社auth / MFA
- secondary object backup
- restore後SHA-256照合
- PC / 390px / 320px実ブラウザUAT
- VPN / 複数端末UAT
- 実社員migration reconciliation

実社員情報・実PDF/画像/スキャン原本は投入禁止を継続します。

## 6. 報告形式

各指摘:

- Critical / High / Medium / Low
- 対象ファイル・関数
- 再現手順
- 実害
- 原因
- 最小修正案
- `f76867997b9b11fa10c4204a8f71a2c5bfecc1d6` で再現するか
- 旧固定点由来か今回hardening由来か
- 実環境ブロッカーかコード不具合か
