const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function src(...parts){return fs.readFileSync(path.join(__dirname,'..',...parts),'utf8')}
const store=src('api','_lib','management-analysis-store.js');
const handler=src('api','v1','analysis','management-summary.js');
const router=src('api','router.js');

test('management analysis combines current workforce operations with snapshot-based safety analysis',()=>{
  assert.ok(store.includes("const {safetySummary}=require('./safety-analysis-store')"));
  assert.ok(store.includes('workforce_basis'));
  assert.ok(store.includes('safety_basis'));
  assert.ok(store.includes('cross_basis'));
  assert.ok(store.includes('managementSummary'));
});

test('management analysis respects feature permissions before exposing non-safety aggregates',()=>{
  for(const feature of ['employees','deadlines','credentials_documents','assets_training','work_import'])assert.ok(store.includes("hasFeaturePermission(user,'"+feature+"'"));
  assert.ok(store.includes('access.credentials?credentialSummary'));
  assert.ok(store.includes('access.assets_training?supportSummary'));
  assert.ok(store.includes('access.work_import?workSummary'));
});

test('management analysis provides aggregate cross-domain signals without employee ranking',()=>{
  assert.ok(store.includes('new_hire_with_safety'));
  assert.ok(store.includes('safety_and_deadline_action'));
  assert.ok(store.includes('retirement_planned_with_assets'));
  assert.equal(store.includes('order by count(*) desc'),false);
  assert.ok(store.includes('個人順位・危険人物判定・退職予測には使用しません'));
});

test('management analysis endpoint is routed under the analysis feature',()=>{
  assert.ok(handler.includes('managementSummary'));
  assert.ok(router.includes('/analysis\\/management-summary'));
  assert.ok(router.includes('v1/analysis/management-summary.js'));
});
