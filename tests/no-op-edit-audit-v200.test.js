const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function block(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0,'missing '+start);
  assert.ok(b>a,'missing '+end);
  return html.slice(a,b);
}

test('training edit skips no-op saves and audit rows',()=>{
  const b=block('function openTrainingRecordForm','function updateQualificationFormGuide');
  assert.ok(b.includes('recordChangeLines'));
  assert.ok(b.includes("course:'安全指導名'"));
  assert.ok(b.includes('if(!lines.length){closeForm();return}'));
});

test('qualification edit compares metadata and evidence document link before saving',()=>{
  const b=block('function openQualificationRecordForm','function openAssetRecordForm');
  for(const token of ['document_id:q.document_id','document_id:fqdoc.value',"document_id:'証憑書類'",'if(!lines.length){closeForm();return}'])assert.ok(b.includes(token),token);
});

test('asset edit skips no-op audit updates',()=>{
  const b=block('function openAssetRecordForm','function openGuidanceRecordForm');
  for(const token of ["item:'品目'","asset_no:'管理番号'","return_due:'返却予定'","status:'状態'",'if(!lines.length){closeForm();return}'])assert.ok(b.includes(token),token);
});

test('guidance edit skips no-op audit updates',()=>{
  const b=block('function openGuidanceRecordForm','function accidentCompletionMissing');
  for(const token of ["date:'日付'","type:'区分'","summary:'内容'","owner:'担当'","next:'次回確認'",'if(!lines.length){closeForm();return}'])assert.ok(b.includes(token),token);
});

test('document edit compares all editable metadata and qualification link before audit',()=>{
  const b=block('function openDocumentForm','function replaceDocument');
  for(const token of [
    "category:'書類区分'","name:'書類名'","date:'登録日'","expiry:'期限'","kind:'ファイル種別'",
    "status:'確認状態'","originalHandling:'原本区分'","securityClass:'機密区分'","accessLevel:'閲覧範囲'",
    "paperLocation:'紙原本保管場所'","retentionUntil:'保管期限'","qualification_id:'関連資格'",
    'if(!lines.length){closeForm();return}'
  ])assert.ok(b.includes(token),token);
});
