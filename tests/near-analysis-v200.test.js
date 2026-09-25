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

test('near-miss analysis dashboard is present and avoids employee count ranking',()=>{
  assert.ok(html.includes('id="nearAnalysisExecutive"'));
  assert.ok(html.includes('id="nearPriorityRisks"'));
  assert.ok(html.includes('id="nearRecurrencePatterns"'));
  assert.ok(html.includes('id="nearCountermeasureEffect"'));
  assert.ok(html.includes('id="nearEducationThemes"'));
  assert.ok(html.includes('件数ランキングは表示しません'));
  assert.equal(html.includes('<h3>社員別 安全記録件数</h3>'),false)
});

test('near-miss analysis uses patterns, risk, recurrence, time and weekday',()=>{
  const b=block('function nearDateValue','function renderSafetyAnalysis');
  for(const token of [
    'function nearPatternEntries',
    'function nearPatternStats',
    'x.high*4',
    'x.recurrence*3',
    'function nearTimeBand',
    'function nearWeekday',
    'function nearRecurrenceHtml'
  ])assert.ok(b.includes(token),token)
});

test('countermeasure comparison is clearly non-causal and based on recorded education or prevention',()=>{
  const b=block('function nearEffectHtml','function renderNearAnalysisDashboard');
  assert.ok(b.includes("String(n.education||'').trim()||String(n.prevention||'').trim()"));
  assert.ok(b.includes('前90日'));
  assert.ok(b.includes('後90日'));
  assert.ok(b.includes('因果関係の判定ではありません'))
});

test('education themes are pattern-based, not person-ranked',()=>{
  const b=block('function nearEducationTheme','function nearDateShift');
  assert.ok(b.includes('交差点右左折時の二輪巻込み'));
  assert.ok(b.includes('後退時の死角確認'));
  assert.ok(b.includes('進路変更時のミラー・目視・合図'));
  assert.ok(b.includes('危険予知（KYT）'))
});

test('safety analysis renderer invokes the near-miss dashboard',()=>{
  const b=block('function renderSafetyAnalysis','function clearAllSafetySearch');
  assert.ok(b.includes('renderNearAnalysisDashboard(near);'))
});
