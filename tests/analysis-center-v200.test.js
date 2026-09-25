const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('index.html','utf8');

assert(html.includes('id="analysis"'),'analysis center page missing');
assert(html.includes('data-p="analysis"'),'analysis nav missing');
assert(html.includes('analysis-company'),'company analysis tab missing');
assert(html.includes('analysis-safety'),'safety analysis tab missing');
assert(html.includes('analysis-hr'),'HR analysis tab missing');
assert(html.includes('analysis-general'),'general affairs analysis tab missing');
assert(html.includes('function renderAnalysisCenter()'),'analysis renderer missing');
assert(html.includes("if(id==='analysis')renderAnalysisCenter()"),'go() does not render analysis center');
assert(html.includes('入社1年以内 × 安全記録'),'cross analysis for new hires and safety missing');
assert(html.includes('勤務 × 安全記録'),'cross analysis for work and safety missing');
assert(html.includes('個人の順位付け・退職予測・危険人物判定は行いません'),'non-ranking/non-prediction safeguard missing');
assert(html.includes('退職日は社員台帳の独立項目を優先し、過去データは在籍状態変更履歴の日付を補助的に使用します。'),'retirement-date provenance note missing');
assert(html.includes('日付が確認できない退職者は推測で期間集計へ含めません。'),'retirement-date no-inference safeguard missing');
assert(!html.includes('<h3>社員別 ヒヤリ件数ランキング</h3>'),'employee near-miss ranking must not be introduced');

console.log('analysis-center-v200: OK');
