const test=require('node:test');
const assert=require('node:assert/strict');

process.env.TSUBAME_ENABLE_STAGING_FIXTURES='1';

const {findUserBySubject,findEmployeeById}=require('../api/_fixtures/staging-registry');
const {canAccessEmployee,listStagingEmployeesForUser}=require('../api/_lib/authorization');

const full=findUserBySubject('demo-admin-full');
const hq=findUserBySubject('demo-admin-hq-taxi');
const fuchu=findUserBySubject('demo-admin-fuchu-taxi');
const self=findUserBySubject('demo-self-hq-taxi');
const empHq=findEmployeeById('aaaaaaaa-aaaa-4aaa-8aaa-aaaaaaaaaaaa');
const empFuchu=findEmployeeById('bbbbbbbb-bbbb-4bbb-8bbb-bbbbbbbbbbbb');
const empBus=findEmployeeById('cccccccc-cccc-4ccc-8ccc-cccccccccccc');

test('full administrator can access every fictional employee',()=>{
  [empHq,empFuchu,empBus].forEach(e=>assert.equal(canAccessEmployee(full,e),true))
});

test('scoped HQ administrator cannot escape assigned office and department',()=>{
  assert.equal(canAccessEmployee(hq,empHq),true);
  assert.equal(canAccessEmployee(hq,empFuchu),false);
  assert.equal(canAccessEmployee(hq,empBus),false);
  const list=listStagingEmployeesForUser(hq,{office:'府中'});
  assert.equal(list.total,0,'request filters must not expand the fixed server-side scope')
});

test('scoped Fuchu administrator sees only the assigned Fuchu department',()=>{
  assert.equal(canAccessEmployee(fuchu,empHq),false);
  assert.equal(canAccessEmployee(fuchu,empFuchu),true);
  assert.equal(canAccessEmployee(fuchu,empBus),false)
});

test('self-service user can access only the linked employee',()=>{
  assert.equal(canAccessEmployee(self,empHq),true);
  assert.equal(canAccessEmployee(self,empFuchu),false);
  assert.equal(canAccessEmployee(self,empBus),false);
  const list=listStagingEmployeesForUser(self,{});
  assert.equal(list.total,1);
  assert.equal(list.items[0].id,self.employee_id)
});

test('pagination is capped and applied after authorization',()=>{
  const list=listStagingEmployeesForUser(full,{page:'1',page_size:'9999'});
  assert.equal(list.page_size,100);
  assert.equal(list.total,3)
});
