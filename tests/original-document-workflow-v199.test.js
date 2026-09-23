const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function block(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0,'missing '+start);
  assert.ok(b>a,'missing '+end);
  return html.slice(a,b)
}

test('original-document center shows a five-item daily priority queue',()=>{
  const b=block('function originalDocumentPriorityHtml','function openOriginalDocumentCenter');
  assert.match(b,/今日、先に確認する原本/);
  assert.match(b,/slice\(0,5\)/);
  assert.match(b,/期限・差替え・未確認・保管不備の順/)
});

test('daily priority ordering covers operational risks',()=>{
  const b=block('function originalDocumentPriorityReason','function originalDocumentPriorityRows');
  for(const text of ['期限超過','差替え待ち','原本未確認','紙原本の保管場所未設定','保管期限到来'])assert.ok(b.includes(text),text);
});

test('priority primary action is contextual and permission aware',()=>{
  const b=block('function originalDocumentPrimaryActionHtml','function originalDocumentPriorityHtml');
  assert.ok(b.includes('canEditDocumentRecord(d)'));
  assert.ok(b.includes('canVerifyOriginalDocument()'));
  assert.ok(b.includes('replaceDocument'));
  assert.ok(b.includes('verifyOriginalDocument'));
  assert.ok(b.includes('openDocumentForm'));
  assert.ok(b.includes('documentPreview'))
});

test('center exposes filters for paper-location and retention exceptions',()=>{
  const b=block('function openOriginalDocumentCenter','function renderOriginalDocumentRows');
  assert.ok(b.includes('保管場所未設定'));
  assert.ok(b.includes('保管期限到来'));
  assert.ok(b.includes("state==='paper_missing'"));
  assert.ok(b.includes("state==='retention'"))
});
