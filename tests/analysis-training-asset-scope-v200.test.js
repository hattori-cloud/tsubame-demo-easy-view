const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('index.html','utf8');

assert(html.includes('id="trainingAnalysisScopeNotice"'),'training scope notice missing');
assert(html.includes("setAnalysisOperationScopeFromCenter('work','training')"),'training page scope route missing');
assert(html.includes("setAnalysisOperationScopeFromCenter('work','work')"),'work page target scope missing');
assert(html.includes("ANALYSIS_OPERATION_SCOPE.targetPage&&id!==ANALYSIS_OPERATION_SCOPE.targetPage"),'page-specific scope clear missing');
assert(html.includes("scopedTraining().filter(t=>analysisOperationScopeMatchNo(t.employee_no))"),'training rows do not honor analysis scope');
assert(html.includes("scopedAssets().filter(a=>analysisOperationScopeMatchNo(a.employee_no))"),'asset rows do not honor analysis scope');
assert(html.includes('分析期間は教育・貸与品画面へは適用せず、現在の未完了・返却状態を確認します。'),'training/asset period clarification missing');
console.log('analysis-training-asset-scope-v200: OK');
