# V200 本番GO / NO-GOチェックリスト

更新日: 2026-09-26

## 技術固定点
- [ ] 承認Git SHAを記録
- [ ] Vercel deployment SHA一致
- [ ] GitHub Actions合格
- [ ] CODEX重大指摘解消

## ネットワーク
- [ ] 社内LAN/Wi-Fi固定グローバルIP/CIDR確定
- [ ] Vercel Trusted IPs / Firewall設定
- [ ] アプリ側CIDR allowlist一致
- [ ] 許可外回線からproduction画面/APIへ到達不可

## DB
- [ ] production PostgreSQL接続
- [ ] least-privilege runtime role
- [ ] schema適用
- [ ] append-only監査
- [ ] DB backup取得
- [ ] 別DB restore成功

## 認証
- [ ] ID + 社員番号 + password
- [ ] MFA
- [ ] suspended拒否
- [ ] retired拒否
- [ ] session失効
- [ ] active full admin 2名以上推奨

## 原本
- [ ] private storage
- [ ] MIME magic-byte
- [ ] size
- [ ] SHA-256
- [ ] malware clean only activation
- [ ] blocked/error閲覧不可
- [ ] short-lived download
- [ ] encrypted secondary backup
- [ ] restore SHA-256一致

## migration
- [ ] manifest
- [ ] employee count
- [ ] active/retired
- [ ] immutable UUID
- [ ] current employee no
- [ ] old employee no history
- [ ] reference integrity
- [ ] reconciliation合格

## UAT
- [ ] PC
- [ ] 390px
- [ ] 320px
- [ ] 社内LAN接続
- [ ] 社内Wi-Fi接続
- [ ] 自宅回線拒否
- [ ] モバイル/テザリング拒否
- [ ] 社外VPN拒否
- [ ] 複数端末
- [ ] full/scoped（selfは本番不可）
- [ ] concurrent edit
- [ ] work import
- [ ] original E2E

## rollback
- [ ] activation OFF手順
- [ ] write停止手順
- [ ] DB保全
- [ ] restore手順
- [ ] 旧運用復帰手順

全項目が満たされるまで、本番開始承認を行わない。
