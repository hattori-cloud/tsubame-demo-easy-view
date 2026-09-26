const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('employee detail grouped tabs cannot be collapsed by legacy six-column rule',()=>{
  assert.ok(html.includes('v200 employee detail grouped-tab layout fix'));
  const marker=html.lastIndexOf('v200 employee detail grouped-tab layout fix');
  const legacy=html.lastIndexOf('.employee-detail-tabs{grid-template-columns:repeat(6,1fr)}');
  assert.ok(marker>legacy,'grouped-tab fix must come after legacy six-column CSS');
  const tail=html.slice(marker);
  assert.ok(tail.includes('grid-template-columns:minmax(0,1fr)!important'));
  assert.ok(tail.includes('grid-template-columns:minmax(140px,150px) repeat(3,minmax(120px,1fr))'));
  assert.ok(tail.includes('writing-mode:horizontal-tb'));
  assert.ok(tail.includes('word-break:keep-all'));
});
