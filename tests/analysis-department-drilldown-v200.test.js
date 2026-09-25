const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('index.html','utf8');
assert(html.includes('function setAnalysisCenterDepartmentFilter(dept)'),'department drilldown helper missing');
assert(html.includes('この部署で見る'),'department drilldown button missing');
assert(html.includes('<th>操作</th>'),'department cross table operation column missing');
assert(html.includes("ANALYSIS_CENTER_FILTERS.dept=value"),'department drilldown does not update common filter');
console.log('analysis-department-drilldown-v200: OK');
