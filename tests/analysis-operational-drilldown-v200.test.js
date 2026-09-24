const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('index.html','utf8');

assert(html.includes("let employees=scopedEmployees().slice();"),'detailed safety filters must use scoped employee master');
assert(!html.includes("let employees=[...new Set(records.map(x=>String(x.employee_no||'')).filter(Boolean))].map(emp).filter(Boolean);"),'record-only employee options must not return');
assert(html.includes("kpi(range.label+'入社'"),'HR hire KPI must use selected period');
assert(html.includes("kpi(range.label+'退職'"),'HR retirement KPI must use selected period');
assert(html.includes("'+range.label+'の事故 '+newHireAcc"),'new-hire safety wording must use selected period');
assert(html.includes("function openAnalysisWorkScreen(kind)"),'analysis operational navigation helper missing');
for(const kind of ['credential','document','work','asset','employee','retired']){
  assert(html.includes("kind==='"+kind+"'"),'analysis navigation target missing: '+kind);
}
assert(html.includes("openAnalysisWorkScreen(\\'credential\\')")||html.includes("openAnalysisWorkScreen('credential')"),'credential drilldown action missing');
assert(html.includes('社員台帳・退職者を確認'),'HR source-record navigation missing');
console.log('analysis-operational-drilldown-v200: OK');
