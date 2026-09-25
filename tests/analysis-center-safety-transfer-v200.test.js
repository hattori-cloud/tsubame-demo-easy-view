const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('index.html','utf8');

assert(html.includes('id="analysisEmployment"'),'detailed safety employment filter missing');
assert(html.includes("function openSafetyAnalysisFromCenter(type='all')"),'analysis center to safety transfer helper missing');
assert(html.includes("set('analysisEmployment',ANALYSIS_CENTER_FILTERS.employment||'')"),'employment transfer missing');
assert(html.includes("function safetyAnalysisRecordMatches(rec,workplace,dept,employment,employeeNo,vehicle)"),'safety matcher employment parameter missing');
assert(html.includes("if(employment&&scope.employment!==String(employment))return false"),'employment snapshot match condition missing');
assert(html.includes('function safetyAnalysisRecordSnapshot(rec)'),'historical safety snapshot resolver missing');
assert(html.includes("employment=document.getElementById('analysisEmployment')?.value||''"),'safety data employment read missing');
assert(html.includes("renderSafetyComparisons({from,to,no,type,workplace,dept,employment,vehicle})"),'comparison scope employment missing');
assert(html.includes("scope={from:d.from,to:d.to,type:d.type,workplace:d.workplace,dept:d.dept,employment:d.employment,no:d.no,vehicle:d.vehicle}"),'drilldown scope employment missing');
assert(html.includes("employment&&'雇用 '+employment"),'analysis note employment scope missing');
assert(html.includes("期間・社員・事業所・部署・雇用区分・号車"),'detailed safety help text missing employment');
console.log('analysis-center-safety-transfer-v200: OK');

assert(html.includes("String(d.getMonth()+1).padStart(2,'0')"),'analysis date helper must use local calendar month');
assert(html.includes("String(d.getDate()).padStart(2,'0')"),'analysis date helper must use local calendar day');
assert.equal(html.includes("function analysisCenterDateText(d){return d instanceof Date&&!Number.isNaN(d.getTime())?d.toISOString().slice(0,10):''}"),false,'analysis date helper still UTC-shifts local calendar dates');
