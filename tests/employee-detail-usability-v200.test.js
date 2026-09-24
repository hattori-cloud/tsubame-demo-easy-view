const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function block(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0,'missing '+start);
  assert.ok(b>a,'missing '+end);
  return html.slice(a,b)
}

test('employee detail separates daily and occasional information',()=>{
  const detail=block('function employeeDetail(no)','function employeeTraining');
  assert.ok(detail.includes('普段見る'));
  assert.ok(detail.includes('安全・期限・資格'));
  assert.ok(detail.includes('必要な時に見る'));
  assert.ok(detail.includes('台帳・所属・書類'));
  assert.ok(detail.includes('勤務・期限'));
  assert.ok(detail.includes('基本台帳'));
});

test('employee detail route does not duplicate all six tab buttons',()=>{
  const route=block('function employeeDetailRouteHtml','function employeeDailyAttentionItems');
  assert.equal(route.includes('employee-detail-jumps'),false);
  assert.ok(route.includes('元の画面へ'));
  assert.ok(route.includes('社員一覧で表示'));
});

test('employee nearest deadline ignores invalid and expired-status qualifications',()=>{
  const nearest=block('function employeeNearestDeadline','function employeeDeadlineHtml');
  assert.ok(nearest.includes("q.status!=='無効'&&q.status!=='失効'"));
});

test('employee management summary ignores invalid qualification deadlines',()=>{
  const summary=block('function employeeDetailAttentionHtml','function employeeOperationalOverviewHtml');
  assert.ok(summary.includes("q.status!=='無効'&&q.status!=='失効'"));
  assert.ok(summary.includes('普段の管理サマリー'));
});

test('employee tab layout remains six functional data tabs',()=>{
  const detail=block('function employeeDetail(no)','function employeeTraining');
  for(const tab of ['safety','work','qualification','basic','affiliation','documents']){
    assert.ok(detail.includes('data-tab="'+tab+'"'));
    assert.ok(detail.includes("setEmployeeDetailTab('"+tab+"')"));
  }
});
