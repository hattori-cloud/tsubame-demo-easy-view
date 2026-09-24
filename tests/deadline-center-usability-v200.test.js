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

test('deadline center has an actionable default and consistent 30-day semantics',()=>{
 const match=block('function deadlineFilterMatch','function normalizeQualificationStatus');
 assert.ok(match.includes("filter==='action'"));
 assert.ok(match.includes("['over','today','7','30'].includes(b)"));
 assert.ok(match.includes("['today','7','30'].includes(b)"));
 const label=block('function deadlineFilterLabel','function deadlineTypeOptions');
 assert.ok(label.includes("action:'今対応する期限'"));
 assert.ok(label.includes("within30:'本日〜30日以内'"));
});

test('home and management open actionable deadlines instead of all future deadlines',()=>{
 assert.ok(html.includes("onclick=\"openDeadlineCenter('action')\">今対応する期限を見る"));
 assert.ok(html.includes("onclick=\"openDeadlineCenter('action')\">今対応する期限</button>"));
 const center=block('function openDeadlineCenter','function exportDeadlinesCsv');
 assert.ok(center.includes('まず「今対応する期限」を確認します'));
 assert.ok(center.includes('期限超過〜30日以内'));
 assert.ok(center.includes('この一覧を上から処理すれば'));
});

test('deadline search accepts historical employee numbers',()=>{
 const rows=block('function renderDeadlineCenterRows','function deadlineTimingText');
 assert.ok(rows.includes('employeeRecordLookupTerms({employee_no:x.no})'));
 assert.ok(html.includes('社員番号（旧番号も可）・担当・対応内容で検索'));
});
