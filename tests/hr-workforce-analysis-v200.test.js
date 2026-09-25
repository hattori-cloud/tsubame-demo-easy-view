const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('index.html','utf8');

assert(html.includes('function ensureRetiredDemoSamples()'),'retired demo sample migration missing');
for(const no of ['7901','7902','7903','7904','7905','7906','7907','7908','7909','7910','7911','7912']){
  assert(html.includes("no:'"+no+"'"),'retired demo employee '+no+' missing');
}
assert(html.includes("['架空退職者サンプル補完',ensureRetiredDemoSamples]"),'retired sample boot migration missing');
assert(html.includes('retiredDate:'),'retiredDate field missing from demo cohort');
assert(html.includes('id="analysisHrAge"'),'age distribution UI missing');
assert(html.includes('id="analysisHrTenure"'),'tenure distribution UI missing');
assert(html.includes('id="analysisHrEmployment"'),'employment distribution UI missing');
assert(html.includes('id="analysisHrExitTenure"'),'exit tenure distribution UI missing');
assert(html.includes('function analysisAgeYears'),'age calculation missing');
assert(html.includes('function analysisTenureYears'),'tenure calculation missing');
assert(html.includes("3か月以内 '+early3.length"),'3-month early exit analysis missing');
assert(html.includes("6か月以内 '+early6.length"),'6-month early exit analysis missing');
assert(html.includes("1年以内 '+earlyRetire.length"),'12-month early exit analysis missing');
assert(html.includes("status:'退職'"),'retired sample status missing');
assert(html.includes('分析確認用の架空退職者サンプル'),'demo marker missing');

console.log('hr-workforce-analysis-v200: OK');
