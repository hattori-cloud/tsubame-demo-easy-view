# V200 共有ログイン試行制限 設計

更新日: 2026-09-25

## 目的

Vercel/serverless各instanceのメモリではなく、全instanceで共有される保存先を使い、network-source単位のログイン試行制限を実装する。

既存:
- account単位 failed_login_count
- account lock
- generic login failure delay

追加対象:
- network/source単位のdistributed rate limiter

## 原則

- login_idやemployee_noの存在有無を外部へ出さない
- source keyは生IPを長期保存しない
- IP prefix等をHMAC/hash化
- proxy headerを無条件に信用しない
- limiter障害時の挙動を明示
- 管理者による解除もaudit

## 推奨キー

複数軸:
1. source hash
2. source hash + login_id hash
3. account id（既存lockout）

sourceは会社proxy/Vercel trusted forwarding設定に従って正規化する。

## 保存先

候補:
- PostgreSQL
- Redis-class shared store

禁止:
- process memoryのみ
- local filesystem
- browser localStorage

## 推奨ルール例

数値は本番前に承認する。

例:
- source単位: 10分で30失敗
- source+login単位: 10分で10失敗
- account単位: 既存5回lock

threshold到達時:
- generic 429または401
- Retry-After
- account存在有無を示さない

## DB案

login_rate_limits:
- key_hash
- bucket_start
- failure_count
- blocked_until
- updated_at

索引:
- key_hash unique
- blocked_until

保存値に生password、MFA code、session tokenを含めない。

## 競合

incrementはatomic:
- INSERT ... ON CONFLICT ... DO UPDATE
- transaction内でfailure_count更新

同時loginでlimit bypassしないことを実DB並列試験する。

## 成功時

account成功時:
- account failure count reset
- source limitは即全消去しない
  - distributed password sprayの痕跡を失わないため

必要に応じて減衰/窓更新。

## ログ

audit:
- login_rate_limited
- source_limit_reached
- account_lock_reached
- admin_rate_limit_override

source hashのみ記録し、生IPの保持は会社方針に従う。

## fail behavior

shared limiterへ接続できない場合:
- productionではfail-openを避ける
- loginを503で止めるか、明示的な緊急運用モードのみ許可
- 緊急モードは短時間・監査必須

## テスト

必須:
- 1 source連続失敗
- 複数accountへのpassword spray
- 2 serverless instance相当の同時increment
- threshold直前/直後
- window rollover
- limiter store outage
- successful login後
- account lockとの組み合わせ
- IPv4/IPv6正規化

## production acceptance

- shared store実接続
- parallel test合格
- no account enumeration
- monitoring/alertあり
- override手順あり
- fail behavior承認済み
