const fs=require('fs');
const assert=require('assert');
const html=fs.readFileSync('index.html','utf8');

for(const id of [
  'analysisGeneralDept','analysisGeneralTenure','analysisGeneralDocuments',
  'analysisGeneralAssets','analysisGeneralQuality'
]){
  assert(html.includes('id="'+id+'"'),id+' missing');
}
assert(html.includes('function analysisGeneralRowsByBand'),'general affairs band helper missing');
assert(html.includes('function analysisGeneralStatusTable'),'general affairs status table missing');
assert(html.includes('function analysisAssetReturned'),'asset returned normalization missing');
assert(html.includes("kpi('適性診断超過'"),'aptitude overdue KPI missing');
assert(html.includes("kpi('原本未確認'"),'document verification KPI missing');
assert(html.includes("kpi('貸与品返却超過'"),'asset return overdue KPI missing');
assert(html.includes("analysisSignal('紙原本の保管場所'"),'paper original location signal missing');
assert(html.includes("analysisSignal('休職・退職手続チェック'"),'lifecycle procedure signal missing');
assert(html.includes("analysisSignal('乗務社員の適性診断次回'"),'driver aptitude data quality signal missing');
assert(html.includes('原本ファイル本体は共有デモに保存しません'),'metadata-only document safeguard missing');
assert(html.includes("if(id==='training')renderTraining()"),'training page render hook missing');
assert(html.includes("健診・適性・残業は人数、資格・指導は件数"),'unit explanation missing');
console.log('general-affairs-analysis-v200: OK');
