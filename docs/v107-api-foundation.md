# v107 本番API実装開始メモ

v107では、本番APIの最初の実装土台を追加する。

## 実装したもの

- `GET /api/v1/health`
  - 業務データを一切返さない公開ヘルスチェック。
  - 認証環境変数の設定有無だけを真偽値で返す。
  - 秘密情報は返さない。
- `/api/v1/secure-probe`
  - 本番認証未設定時は必ず `503 AUTH_NOT_CONFIGURED`。
  - 認証設定が存在しても、署名検証実装前は `501 IDENTITY_VERIFIER_NOT_IMPLEMENTED`。
  - ブラウザから送られた役割・事業所・部署を信頼しない。
- `api/_lib/security.js`
  - no-store、nosniff、no-referrer、DENYフレーム等の共通ヘッダ。
  - Request ID生成。
  - fail-closed判定。

## まだ接続しないもの

- 実社員DB
- 実社員番号・氏名
- Google Workspace / Entra ID等の認証
- PostgreSQL
- PCA
- アントレ

## 次の実装順

1. 認証プロバイダを確定。
2. JWT/セッションの署名・issuer・audience検証。
3. 認証subjectを `users.external_subject` に対応付け。
4. active/suspended判定。
5. server-side role/scope算出。
6. 架空社員1名だけを返す staging API。
7. scoped adminの範囲外アクセスを403/404で拒否。
8. 事故1件の登録・version競合・監査ログを縦に通す。

この段階では、認証が未完成のまま業務データAPIを公開しない。
