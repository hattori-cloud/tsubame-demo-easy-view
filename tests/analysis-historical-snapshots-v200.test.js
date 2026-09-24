const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const schema=fs.readFileSync(path.join(__dirname,'..','docs','production-schema.sql'),'utf8');
const contract=fs.readFileSync(path.join(__dirname,'..','docs','api-contract.md'),'utf8');

function block(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0,'missing '+start);
  assert.ok(b>a,'missing '+end);
  return html.slice(a,b)
}

test('safety analysis prefers historical organization snapshots over current employee assignment',()=>{
  const b=block('function safetyAnalysisRecordSnapshot','function safetyAnalysisData');
  for(const token of ['officeAtRecord','officeAtReport','departmentAtRecord','departmentAtReport','employmentAtRecord','employmentAtReport',"source:hasSnapshot?'snapshot':'current'"]){
    assert.ok(b.includes(token),token+' missing from snapshot resolver')
  }
  assert.ok(b.includes('scope.workplace'));
  assert.ok(b.includes('scope.dept'));
  assert.ok(b.includes('scope.employment'));
});

test('new safety records freeze organization context and complaint edits preserve it',()=>{
  assert.ok(html.includes("officeAtRecord:e.branch||e.workplace||''"));
  assert.ok(html.includes("departmentAtRecord:e.dept||''"));
  assert.ok(html.includes("employmentAtRecord:e.employment||''"));
  assert.ok(html.includes("employmentAtReport:rec?.employmentAtReport||e.employment||''"));
  assert.ok(html.includes("officeAtRecord:rec?.officeAtRecord||e.branch||e.workplace||''"));
  assert.ok(html.includes("departmentAtRecord:rec?.departmentAtRecord||rec?.dept||e.dept||''"));
  assert.ok(html.includes("dept:rec?.dept||e.dept"));
});

test('analysis exposes safety quality ratios without calling headcount ratio a true incidence rate',()=>{
  assert.ok(html.includes('事故1件平均修理費'));
  assert.ok(html.includes('高危険比率'));
  assert.ok(html.includes('未完了比率'));
  assert.ok(html.includes('所属スナップショット'));
  assert.ok(html.includes('100人在籍あたり参考比'));
  assert.ok(html.includes('走行距離・乗務回数で補正した発生率ではありません'));
  assert.ok(html.includes('現在所属代用 '));
});

test('production schema contains organization snapshots for every safety record type',()=>{
  assert.match(schema,/create table accidents[\s\S]*office_at_record text,[\s\S]*department_at_record text,[\s\S]*employment_at_record text,/i);
  assert.match(schema,/create table near_misses[\s\S]*office_at_report text not null,[\s\S]*department_at_report text not null,[\s\S]*employment_at_report text,/i);
  assert.match(schema,/create table complaints[\s\S]*office_at_record text,[\s\S]*department_at_record text,[\s\S]*employment_at_record text,/i);
});

test('production API contract makes historical snapshot fields server-derived and immutable',()=>{
  assert.ok(contract.includes('server-derived'));
  assert.ok(contract.includes('must not rewrite them after a later transfer'));
  assert.ok(contract.includes('Snapshot fields are server-derived and immutable through normal PATCH'));
  assert.ok(contract.includes('later employee transfer must not move the historical complaint'));
});


test('safety analysis reports data completeness for interpretation quality',()=>{
  assert.ok(html.includes('分析項目充足率'));
  assert.ok(html.includes('accidentAnalysisReady'));
  assert.ok(html.includes('complaintAnalysisReady'));
  assert.ok(html.includes('nearAnalysisReady'));
  assert.ok(html.includes("near.filter(n=>!nearNeedsAnalysis(n)).length"));
});
