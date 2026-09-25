const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('main safety forms explain where the user goes after save',()=>{
  assert.ok(html.includes("setFormAfterSaveHint('登録した事故の詳細を開きます')"));
  assert.ok(html.includes("setFormAfterSaveHint('更新した事故の詳細を開きます')"));
  assert.ok(html.includes("setFormAfterSaveHint(rec?'更新したヒヤリ詳細を開きます':'登録したヒヤリ詳細を開きます')"));
  assert.ok(html.includes("setFormAfterSaveHint(rec?'更新した苦情・お客様対応の詳細を開きます':'登録した苦情・お客様対応の詳細を開きます')"));
});

test('locked safety-record person wording distinguishes reassignment from employee-number changes',()=>{
  assert.ok(html.includes('登録後に別の社員へ付け替えることはできません。社員番号の変更は社員台帳から行ってください。'));
  assert.ok(html.includes('登録後に別の乗務員へ付け替えることはできません。社員番号の変更は社員台帳から行ってください。'));
});
