const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('index.html','utf8');

assert(html.includes('id="eemployment"'),'employee employment filter missing');
assert(html.includes('全雇用区分'),'employee employment default option missing');
assert(html.includes('function syncEmployeeEmploymentFilter()'),'employee employment sync helper missing');
assert(html.includes("employmentFilter=document.getElementById('eemployment')?.value||''"),'employee render employment filter read missing');
assert(html.includes("(!employmentFilter||e.employment===employmentFilter)"),'employee employment filter condition missing');
assert(html.includes("if(kind==='employee'||kind==='retired')"),'analysis employee/retired transfer missing');
assert(html.includes("ebEl.value=ANALYSIS_CENTER_FILTERS.workplace||''"),'workplace transfer to employee ledger missing');
assert(html.includes("edEl.value=ANALYSIS_CENTER_FILTERS.dept||''"),'department transfer to employee ledger missing');
assert(html.includes("set('eemployment',ANALYSIS_CENTER_FILTERS.employment||'')"),'employment transfer to employee ledger missing');
assert(html.includes("esEl.value=kind==='retired'?'退職':''"),'retired transfer state missing');
console.log('analysis-employee-scope-transfer-v200: OK');
