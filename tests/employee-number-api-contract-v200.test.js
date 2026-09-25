const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const contract=fs.readFileSync(path.join(__dirname,'..','docs','api-contract.md'),'utf8');

test('employee number changes use a dedicated full-admin transaction',()=>{
  assert.match(contract,/POST \/api\/v1\/employees\/\{id\}\/employee-number/);
  assert.match(contract,/Full administrator only/);
  assert.match(contract,/reject a number recorded as another employee's historical number/);
  assert.match(contract,/employee_number_history/);
  assert.match(contract,/All business relations continue to use immutable `employee_id` UUIDs/);
  assert.match(contract,/Historical snapshots such as `near_misses\.employee_no_at_report` remain unchanged/);
});

test('general employee patch does not silently renumber employees',()=>{
  assert.match(contract,/`employee_no` is not changed through this general PATCH/);
});
