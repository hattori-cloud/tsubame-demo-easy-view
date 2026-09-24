const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function src(...parts){return fs.readFileSync(path.join(__dirname,'..',...parts),'utf8')}
const store=src('api','_lib','deadline-store.js');
const route=src('api','v1','deadlines','index.js');

test('deadline API aggregates the main operational due-date domains',()=>{
  for(const term of ['license_expiry','health_check_due','aptitude_due','qualifications','documents','safety_training','assets','inspection_due','next_maintenance_due']){
    assert.ok(store.includes(term),term+' missing from deadline aggregation');
  }
});

test('deadline filters preserve actionable over-today-30 semantics',()=>{
  assert.ok(store.includes("filter==='action'"));
  assert.ok(store.includes("filter==='within30'"));
  assert.ok(store.includes("filter==='over'"));
  assert.ok(store.includes("filter==='today'"));
});

test('deadline date arithmetic is database-date based instead of JS timezone arithmetic',()=>{
  assert.ok(store.includes('current_date'));
  assert.ok(store.includes('days_remaining'));
  assert.equal(store.includes('new Date('),false);
});

test('deadline visibility reuses employee vehicle and document authorization rules',()=>{
  assert.ok(store.includes('scopeSql(user,params'));
  assert.ok(store.includes('vehicleScopeSql(user,params'));
  assert.ok(store.includes('documentVisibilitySql(user,identity'));
});

test('deadline API is authenticated paginated and returns urgency summary',()=>{
  assert.ok(route.includes('authenticateRequest(req)'));
  assert.ok(route.includes('resolveCurrentUser(identity)'));
  assert.ok(store.includes('pageSize=Math.min(100'));
  for(const field of ['overdue','today','within7','within30','within60'])assert.ok(store.includes(field));
});
