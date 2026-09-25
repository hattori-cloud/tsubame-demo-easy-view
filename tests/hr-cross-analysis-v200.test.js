const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('index.html','utf8');

for(const id of ['analysisHrAgeDept','analysisHrTenureDept','analysisHrAgeSafety','analysisHrTenureSafety']){
  assert(html.includes('id="'+id+'"'),id+' UI missing');
}
assert(html.includes('id="analysisHrFiscalTrend"'),'fiscal trend UI missing');
assert(html.includes('function analysisFiscalYearNumber'),'fiscal year helper missing');
assert(html.includes('直近5年度の入社・退職・純増減'),'fiscal trend explanation missing');
assert(html.includes('function analysisSafetyRecordDate'),'safety record date helper missing');
assert(html.includes('function analysisMatrixHtml'),'cross matrix helper missing');
assert(html.includes('function analysisDeptBandRows'),'department band helper missing');
assert(html.includes('function analysisSafetyByBandHtml'),'band safety helper missing');
assert(html.includes("let ageColumns=['29歳以下','30代','40代','50代','60代','70歳以上']"),'age bands missing');
assert(html.includes("let tenureColumns=['1年未満','1～3年未満','3～5年未満','5～10年未満','10～20年未満','20年以上']"),'tenure bands missing');
assert(html.includes("analysisSignal('入社1年未満 × 安全'"),'new hire safety signal missing');
assert(html.includes('件数だけで個人・年代・社歴を評価しません'),'non-evaluative safety disclaimer missing');
assert(html.includes('対象人数</th><th>事故</th><th>ヒヤリ</th><th>高危険</th><th>苦情'),'safety denominator table missing');
console.log('hr-cross-analysis-v200: OK');
