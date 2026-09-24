const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('index.html','utf8');

assert(html.includes('id="analysisCompanyDeptCross"'),'company department cross table missing');
assert(html.includes('id="analysisCompanyOverlap"'),'company overlap section missing');
assert(html.includes('function analysisCompanyDeptTable'),'company department table helper missing');
assert(html.includes("kpi('複数領域確認'"),'overlap KPI missing');
assert(html.includes("kpi('3領域確認'"),'three-domain KPI missing');
assert(html.includes("analysisSignal('安全 × 勤務 × 総務'"),'three-domain signal missing');
assert(html.includes('2領域以上で確認が必要'),'multi-domain explanation missing');
assert(html.includes('個人順位やスコアは作らず'),'non-scoring safeguard missing');
assert(html.includes('単位の異なる項目を人事評価には使いません'),'mixed-unit safeguard missing');
assert(html.includes('安全記録は直近12か月、入退職は今年度'),'time-period explanation missing');
console.log('company-cross-analysis-v200: OK');
