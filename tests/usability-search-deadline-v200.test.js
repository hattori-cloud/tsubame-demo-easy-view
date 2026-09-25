const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function block(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0,'missing '+start);
  assert.ok(b>a,'missing '+end);
  return html.slice(a,b)
}

test('deadline center excludes invalid qualifications and historical documents',()=>{
  const b=block('function collectDeadlines','function deadlineClass');
  assert.ok(b.includes("q.status!=='無効'&&q.status!=='失効'"));
  assert.ok(b.includes('!d.archived'));
  assert.ok(b.includes('!d.replacedByDocumentId'));
  assert.ok(b.includes("d.status!=='差替え済み'"));
  assert.ok(b.includes("d.status!=='無効'"))
});

test('global search marks invalid qualifications and old documents as history',()=>{
  const b=block('function searchAll','function openEmployeeEdit');
  assert.ok(b.includes("let history=['無効','失効'].includes(x.status||'')"));
  assert.ok(b.includes("let history=!!d.archived||!!d.replacedByDocumentId||['差替え済み','無効'].includes(d.status||'')"));
  assert.ok(b.includes("history,title:"));
  assert.ok(b.includes("documentOperationalStatusLabel(d)"))
});

test('history search cards are visibly labelled and ranked lower',()=>{
  const score=block('function globalSearchScore','function globalSearchVisibleResults');
  const render=block('function renderGlobalSearchResults','let GLOBAL_SEARCH_TIMER=');
  assert.ok(score.includes('if(result?.history)score-=35'));
  assert.ok(render.includes("r.history?'<span class=\"badge\">履歴</span>':'"));
  assert.ok(html.includes('.search-result-card.search-result-history'))
});

test('all-search reserves room for multiple current record groups',()=>{
  const source=block('function globalSearchGroup','function renderGlobalSearchResults');
  const context={};
  vm.createContext(context);
  vm.runInContext(source,context);
  const rows=[];
  for(let i=0;i<12;i++)rows.push({label:'社員',title:'社員'+i});
  for(let i=0;i<4;i++)rows.push({label:'事故',title:'事故'+i});
  for(let i=0;i<4;i++)rows.push({label:'車両',title:'車両'+i});
  for(let i=0;i<4;i++)rows.push({label:'資格',title:'資格'+i});
  const visible=context.globalSearchVisibleResults(rows,'all',18);
  assert.equal(visible.length,18);
  assert.ok(visible.some(x=>x.label==='社員'));
  assert.ok(visible.some(x=>x.label==='事故'));
  assert.ok(visible.some(x=>x.label==='車両'));
  assert.ok(visible.some(x=>x.label==='資格'))
});

test('history rows do not consume reserved current-record group slots',()=>{
  const source=block('function globalSearchGroup','function renderGlobalSearchResults');
  const context={};
  vm.createContext(context);
  vm.runInContext(source,context);
  const rows=[
    {label:'資格',title:'古い資格1',history:true},
    {label:'資格',title:'現行資格',history:false},
    {label:'社員',title:'社員1',history:false},
    {label:'車両',title:'801号車',history:false}
  ];
  const visible=context.globalSearchVisibleResults(rows,'all',3);
  assert.equal(visible.length,3);
  assert.ok(visible.some(x=>x.title==='現行資格'));
  assert.equal(visible.some(x=>x.title==='古い資格1'),false)
});

test('global search shows employee lifecycle and opens the exact document',()=>{
  const b=block('function searchAll','function openEmployeeEdit');
  assert.ok(b.includes("sub:\`${e.status||'在籍'} /"));
  assert.ok(b.includes("open:\`documentPreview('"));
  assert.ok(b.includes("\${d.id}"))
});

test('daily deadline routing opens the exact target and visible modal',()=>{
  const open=block('function deadlineOpen',"let DEADLINE_PAGE=");
  assert.ok(open.includes("employeeQualification(no,1,key)"));
  assert.ok(open.includes("employeeTraining(no,1,key)"));
  assert.ok(open.includes("employeeAssets(no,1,key)"));
  assert.ok(open.includes("documentPreview(key)"));
  assert.ok(open.includes("if(type==='適性診断'){employeeDetail(no);setTimeout(()=>setEmployeeDetailTab('work'),30);return}"));

  const training=block('function employeeTraining','function employeeQualification');
  const qualification=block('function employeeQualification','function employeeAssets');
  const assets=block('function employeeAssets','function analysisDateInRange');
  for(const source of [training,qualification,assets]){
    assert.ok(source.includes("focusKey=''"));
    assert.ok(source.includes('record-focus-row'));
    assert.ok(source.includes('期限対象'));
    assert.ok(source.includes('showDetailModal()'))
  }
});
