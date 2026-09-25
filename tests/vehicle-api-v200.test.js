const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function src(...parts){return fs.readFileSync(path.join(__dirname,'..',...parts),'utf8')}
const store=src('api','_lib','vehicle-store.js');
const schema=src('docs','production-schema.sql');
const assignment=src('api','v1','vehicles','[id]','assignments.js');

test('vehicle production schema includes model and three-digit car number',()=>{
  assert.match(schema,/create table vehicles[\s\S]*car_no text not null unique check \(car_no ~ '\^\[0-9\]\{3\}\$'\)[\s\S]*model text/i);
});

test('vehicle visibility is derived from server-side employee scope',()=>{
  assert.ok(store.includes('function vehicleScopeSql'));
  assert.ok(store.includes('user.role_level===\'scoped\''));
  assert.ok(store.includes('exists(select 1 from employees se'));
});

test('vehicle assignment changes are transactionally versioned and audited',()=>{
  assert.ok(store.includes('withTransaction(async client=>'));
  assert.ok(store.includes('USE_ASSIGNMENTS_ENDPOINT'));
  assert.ok(store.includes('version=version+1'));
  assert.ok(store.includes("'assignments_change'"));
  assert.ok(store.includes("'車両担当変更'"));
  assert.ok(assignment.includes('parseIfMatchHeader'));
});

test('dedicated vehicle requires a primary employee and all assigned employees pass scope checks',()=>{
  assert.ok(store.includes("mode==='dedicated'&&!primary"));
  assert.ok(store.includes('visibleEmployee(user,primaryId,client)'));
  assert.ok(store.includes('visibleEmployee(user,eid,client)'));
});

test('vehicle list is paginated and does not load archived vehicles by default',()=>{
  assert.ok(store.includes("'v.archived_at is null'"));
  assert.ok(store.includes('pageSize=Math.min(100'));
});


test('vehicle list and detail are manager-only and scoped employee fields are filtered',()=>{
  assert.match(store,/async function listVehicles\(user,filters=\{\}\)\{\s*requireVehicleManager\(user\)/);
  assert.match(store,/async function getVehicle\(user,id,client=null,\{forUpdate=false\}=\{\}\)\{\s*requireVehicleManager\(user\)/);
  assert.ok(store.includes("join employees eu on eu.id=vu.employee_id and (${assignedScope})"));
  assert.ok(store.includes("left join employees e on e.id=v.primary_employee_id and (${primaryScope})"));
  assert.ok(store.includes("and (${searchPrimaryScope})"));
  assert.ok(store.includes("and (${searchAssignedScope})"));
  assert.ok(store.includes("ilike $${p}"));
});


test('vehicle assignment edits apply deltas instead of ending and reinserting unchanged assignments',()=>{
  assert.ok(store.includes('const desiredUsers='));
  assert.ok(store.includes('const beforeKeys=new Set'));
  assert.ok(store.includes('const desiredKeys=new Set'));
  assert.ok(store.includes('if(!desiredKeys.has(key))'));
  assert.ok(store.includes('if(!beforeKeys.has(key))'));
  assert.ok(schema.includes('create unique index vehicle_users_active_unique'));
  assert.ok(schema.includes('where ended_on is null;'));
  assert.equal(schema.includes('unique (vehicle_id, employee_id, role, assigned_on)'),false);
});
