const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const sql=fs.readFileSync(path.join(__dirname,'..','docs','production-schema.sql'),'utf8');
const api=fs.readFileSync(path.join(__dirname,'..','docs','api-contract.md'),'utf8');

test('accident edit flow contains investigation report fields',()=>{
  ['faeweather','faepolice','faeopponent','faeonsite','faeroad','faedamage','faeevidence','faereportstatus']
    .forEach(id=>assert.match(html,new RegExp('id="'+id+'"')));
});

test('existing accident records receive safe report-sheet defaults',()=>{
  assert.match(html,/\['weather','未設定'\]/);
  assert.match(html,/\['policeStatus','未確認'\]/);
  assert.match(html,/\['evidenceStatus','未確認'\]/);
  assert.match(html,/\['reportSheetStatus','未着手'\]/);
});

test('accident report-sheet values are persisted and visible',()=>{
  assert.match(html,/opponentSummary:faeopponent\.value\.trim\(\)/);
  assert.match(html,/onsiteActions:faeonsite\.value\.trim\(\)/);
  assert.match(html,/roadCondition:faeroad\.value\.trim\(\)/);
  assert.match(html,/damageInjurySummary:faedamage\.value\.trim\(\)/);
  assert.match(html,/事故報告・調査票/);
});

test('production schema and API contract include report-sheet fields',()=>{
  ['weather','opponent_summary','onsite_actions','road_condition','damage_injury_summary','police_status','evidence_status','report_sheet_status']
    .forEach(name=>assert.match(sql,new RegExp('\\b'+name+'\\b')));
  assert.match(api,/follow-up accident investigation fields/i);
});


test('accident report can be previewed and printed as two pages',()=>{
  assert.match(html,/function openAccidentReportPrint/);
  assert.match(html,/報告書プレビュー・印刷/);
  assert.match(html,/事故処理・調査記録/);
  assert.match(html,/印刷 \/ PDF保存/);
  assert.match(html,/現場見取図・写真貼付欄/);
  assert.match(html,/車両損傷図・伝達事項/);
});

test('accident detail warns about report fields still missing',()=>{
  assert.match(html,/function accidentReportMissingFields/);
  assert.match(html,/報告書の未入力/);
  assert.match(html,/不足項目を入力/);
});


test('cannot mark investigation report complete while required fields are missing',()=>{
  assert.match(html,/faereportstatus\.value==='完成'&&reportMissing\.length/);
  assert.match(html,/事故調査票を「完成」にするには/);
  assert.match(html,/faereportstatus\.value='作成中'/);
});


test('accident evidence metadata is linked by accident id',()=>{
  assert.match(html,/const ACCIDENT_DOCUMENT_ROLES=/);
  assert.match(html,/linkedEntityType:'accident'/);
  assert.match(html,/linkedEntityId:String\(a\.id\)/);
  assert.match(html,/documentRole:faedocrole\.value/);
  assert.match(html,/reportPlacement:faedocprint\.value/);
});

test('linked accident evidence is shown and placed in report preview',()=>{
  assert.match(html,/function accidentDocuments/);
  assert.match(html,/function accidentEvidenceSummaryHtml/);
  assert.match(html,/function accidentEvidencePrintHtml/);
  assert.match(html,/事故資料を紐づける/);
  assert.match(html,/共有デモ：実画像未接続/);
});

test('document replacement preserves accident evidence relation',()=>{
  assert.match(html,/linkedEntityType:d\?\.linkedEntityType\|\|source\?\.linkedEntityType/);
  assert.match(html,/!d\.replacedByDocumentId&&d\.category==='事故資料'/);
});

test('API contract secures accident evidence and report export',()=>{
  assert.match(api,/accidents\/\{id\}\/evidence\/upload-ticket/);
  assert.match(api,/accidents\/\{id\}\/report-export/);
  assert.match(api,/must not place raw storage keys, permanent public URLs, or reusable signed URLs/i);
});
