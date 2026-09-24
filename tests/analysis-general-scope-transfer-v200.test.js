const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('index.html','utf8');

assert(html.includes('let ANALYSIS_OPERATION_SCOPE=null'),'temporary analysis operation scope missing');
assert(html.includes("function setAnalysisOperationScopeFromCenter(mode='modal')"),'scope setup helper missing');
assert(html.includes('function analysisOperationScopeMatchNo(no)'),'scope employee matcher missing');
assert(html.includes('function analysisOperationScopeBannerHtml()'),'scope banner helper missing');
assert(html.includes("if(kind==='deadline'){setAnalysisOperationScopeFromCenter('modal');openDeadlineCenter('all');return}"),'deadline scoped route missing');
assert(html.includes("if(kind==='credential'){setAnalysisOperationScopeFromCenter('modal');openCredentialCenter();return}"),'credential scoped route missing');
assert(html.includes("if(kind==='document'){setAnalysisOperationScopeFromCenter('modal');openOriginalDocumentCenter();return}"),'document scoped route missing');
assert(html.includes("if(kind==='work'){setAnalysisOperationScopeFromCenter('work');go('work');return}"),'work scoped route missing');
assert(html.includes("rows.filter(x=>analysisOperationScopeMatchNo(x.no))"),'deadline collection does not honor analysis scope');
assert(html.includes("inCurrentEmployeeScope(q.employee_no)&&analysisOperationScopeMatchNo(q.employee_no)"),'credential qualifications do not honor scope');
assert(html.includes("canViewDocumentRecord(d)&&!d.archived&&analysisOperationScopeMatchNo(d.employee_no)"),'credential documents do not honor scope');
assert(html.includes("canViewDocumentRecord(d)&&analysisOperationScopeMatchNo(d.employee_no)"),'original document center does not honor scope');
assert(html.includes("e.status!=='退職'&&analysisOperationScopeMatchNo(e.no)"),'work page does not honor scope');
assert(html.includes('id="workAnalysisScopeNotice"'),'work scope notice missing');
assert(html.includes('分析期間は引き継がず、この画面では現在の期限・確認状態を表示します。'),'deadline/credential period clarification missing');
assert(html.includes('分析期間は勤務画面へは適用せず、現在の期限・勤務状態を確認します。'),'work period clarification missing');
assert(html.includes("if(ANALYSIS_OPERATION_SCOPE?.mode==='modal')ANALYSIS_OPERATION_SCOPE=null"),'modal scope clear missing');
assert(html.includes("if(ANALYSIS_OPERATION_SCOPE?.mode==='work'&&id!=='work')ANALYSIS_OPERATION_SCOPE=null"),'work scope clear on navigation missing');
assert(html.includes("openAnalysisWorkScreen(\\'deadline\\')")||html.includes("openAnalysisWorkScreen('deadline')"),'analysis deadline button missing');
assert(html.includes("openAnalysisWorkScreen(\\'document\\')")||html.includes("openAnalysisWorkScreen('document')"),'analysis original-document scoped button missing');

console.log('analysis-general-scope-transfer-v200: OK');
