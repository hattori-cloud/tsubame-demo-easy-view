const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('index.html','utf8');

for(const id of ['analysisCenterPeriod','analysisCenterFrom','analysisCenterTo','analysisCenterWorkplace','analysisCenterDept','analysisCenterEmployment','analysisCenterScopeSummary']){
  assert(html.includes('id="'+id+'"'),id+' missing');
}
assert(html.includes("let ANALYSIS_CENTER_FILTERS={period:'fy'"),'analysis center filter state missing');
assert(html.includes('function analysisCenterRange'),'analysis center range helper missing');
assert(html.includes('function syncAnalysisCenterFilters'),'analysis center filter sync missing');
assert(html.includes('function analysisCenterFilteredEmployees'),'analysis center employee filter missing');
assert(html.includes('function clearAnalysisCenterFilters'),'analysis center clear filter missing');
assert(html.includes("analysisScopedSafety(scopeNosFilter,range)"),'safety analysis does not use common employee/range filter');
assert(html.includes("analysisSafetyByBandHtml(active,safety,today,e=>analysisAgeBand(analysisAgeYears(e,today)),ageColumns,range)"),'age safety cross analysis does not use range');
assert(html.includes("analysisSafetyByBandHtml(active,safety,today,e=>analysisTenureBand(analysisTenureYears(e,today)),tenureColumns,range)"),'tenure safety cross analysis does not use range');
assert(html.includes("kpi(range.label+'入社'"),'hire KPI is not range-aware');
assert(html.includes("kpi(range.label+'退職'"),'retirement KPI is not range-aware');
assert(html.includes("対象社員 '+employees.length+'名"),'scope employee count missing');
assert(html.includes('<th>期間内入社</th><th>期間内退職</th>'),'company department table period headers missing');

console.log('analysis-center-filters-v200: OK');

assert(html.includes('onchange="analysisCenterDimensionChanged()"'),'analysis dimension onchange handler missing');
assert(html.includes("ANALYSIS_CENTER_FILTERS.dept=document.getElementById('analysisCenterDept')?.value||''"),'department selection is not persisted before redraw');
assert(html.includes("ANALYSIS_CENTER_FILTERS.employment=document.getElementById('analysisCenterEmployment')?.value||''"),'employment selection is not persisted before redraw');
