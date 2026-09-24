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

test('employee number can change without changing the stable internal employee id',()=>{
  const helpers=block('function systemEmployeeId','function badge');
  assert.ok(helpers.includes('function nextStableEmployeeId()'));
  assert.ok(helpers.includes("EMP-I'+String(n++).padStart(6,'0')"));
  assert.ok(helpers.includes('function employeeNumberOwner'));
  assert.ok(helpers.includes('function migrateEmployeeNumberReferences'));
  assert.ok(helpers.includes('rec.employee_no=to'));
  assert.ok(helpers.includes('rec.employee_id=stableId'));
});

test('new employees receive stable id and employee edits retain old employee numbers',()=>{
  const create=block('function openEmployeeForm','function openAccidentForm');
  assert.ok(create.includes('system_id:nextStableEmployeeId(),oldNos:[]'));
  const edit=block('function openEmployeeEdit','function openEmployeeForm');
  assert.ok(edit.includes('id="feno"'));
  assert.ok(edit.includes('社員番号に空白は使用できません'));
  assert.ok(edit.includes('employeeNumberOwner(requestedNo,e.system_id)'));
  assert.ok(edit.includes('e.oldNos.push(oldEmployeeNo)'));
  assert.ok(edit.includes("audit('社員番号変更'"));
  assert.ok(edit.includes('employeeDetail(e.no)'));
});

test('employee number migration updates live references but leaves report-time number snapshots untouched',()=>{
  const helpers=block('function systemEmployeeId','function badge');
  for(const list of ['A','V','N','C','TR','AS','QUAL','GUIDANCE','DOCS','APPLICATIONS']){
    assert.ok(helpers.includes(list),'missing '+list+' from migration helper')
  }
  assert.ok(!helpers.includes('employeeNoAtReport='));
  assert.ok(!helpers.includes('officeAtReport='));
  assert.ok(!helpers.includes('departmentAtReport='));
});

test('near-miss monthly quota uses stable employee id so number changes do not move historical totals',()=>{
  const quota=block('function buildNearQuotaTargetSnapshot','function nearQuotaStats');
  assert.ok(quota.includes('employee_id:e.system_id||systemEmployeeId(e.no)'));
  assert.ok(quota.includes('String(t.employee_id||t.employee_no)'));
  assert.ok(quota.includes('String(n.employee_id||n.employee_no||\'\')'));
  assert.ok(quota.includes('employeeByAnyId(t.employee_id||historicalNo)'));
});

test('employee number collisions include historical employee numbers',()=>{
  const helpers=block('function systemEmployeeId','function badge');
  assert.ok(helpers.includes('Array.isArray(e.oldNos)&&e.oldNos.map(String).includes(value)'));
  const edit=block('function openEmployeeEdit','function openEmployeeForm');
  assert.ok(edit.includes('現在番号または旧社員番号として既に使用されています'));
});
