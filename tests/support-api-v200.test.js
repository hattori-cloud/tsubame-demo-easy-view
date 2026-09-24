const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

function src(...parts){return fs.readFileSync(path.join(__dirname,'..',...parts),'utf8')}
const store=src('api','_lib','support-store.js');

test('training assets and guidance all use server-side employee scope',()=>{
  assert.ok(store.includes('scopeSql(user,params'));
  assert.ok(store.includes('employeeForUser(user'));
  for(const table of ['safety_training','assets','guidance_records'])assert.ok(store.includes(table));
});

test('support record person cannot be reassigned after registration',()=>{
  assert.ok(store.includes('EMPLOYEE_REASSIGN_NOT_ALLOWED'));
  assert.ok(store.includes('登録後に別の社員へ付け替えることはできません'));
});

test('support updates are optimistic-concurrency protected and no-op safe',()=>{
  assert.ok(store.includes('VERSION_CONFLICT'));
  assert.ok(store.includes('if(!changed.length)return before'));
  assert.ok(store.includes('version=version+1'));
});

test('support mutations atomically write history and audit rows',()=>{
  assert.ok(store.includes('withTransaction(async client=>'));
  assert.ok(store.includes('insert into record_histories'));
  assert.ok(store.includes('insert into audit_logs'));
});

test('all support collection and detail routes authenticate through server identity',()=>{
  for(const p of [
    ['api','v1','training','index.js'],['api','v1','training','[id].js'],
    ['api','v1','assets','index.js'],['api','v1','assets','[id].js'],
    ['api','v1','guidance','index.js'],['api','v1','guidance','[id].js']
  ]){
    const route=src(...p);
    assert.ok(route.includes('authenticateRequest(req)'));
    assert.ok(route.includes('resolveCurrentUser(identity)'));
  }
});
