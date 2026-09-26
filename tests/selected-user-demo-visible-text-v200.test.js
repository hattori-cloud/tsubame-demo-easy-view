const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('visible selected-user guidance matches internal-network-only production policy',()=>{
  assert.ok(html.includes('会社が指定した利用者へ個人IDを発行'));
  assert.ok(html.includes('指定利用者は必須'));
  assert.ok(html.includes("gate:'社内LAN・社内Wi-Fi限定'"));
  assert.ok(html.includes('自宅回線・モバイル回線・テザリング・社外Wi-Fi・社外VPNは許可しない'));
  assert.ok(html.includes('事業所×部署×機能×閲覧/編集権限'));
  assert.equal(html.includes("gate:'実VPN・スマホ疎通'"),false);
  assert.equal(html.includes('VPN必須にするか、インターネット公開＋強固な認証'),false);
  assert.equal(html.includes('全社管理者／担当管理者／一般社員のUAT'),false);
});
