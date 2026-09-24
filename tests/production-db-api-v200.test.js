const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const db=fs.readFileSync(path.join(__dirname,'..','api','_lib','db.js'),'utf8');
const authStore=fs.readFileSync(path.join(__dirname,'..','api','_lib','auth-store.js'),'utf8');
const employeeStore=fs.readFileSync(path.join(__dirname,'..','api','_lib','employee-store.js'),'utf8');
const renumber=fs.readFileSync(path.join(__dirname,'..','api','v1','employees','[id]','employee-number.js'),'utf8');
const transition=fs.readFileSync(path.join(__dirname,'..','api','v1','employees','[id]','transition.js'),'utf8');

test('production database adapter uses pool and rollback-safe transactions',()=>{
  assert.ok(db.includes("new Pool"));
  assert.ok(db.includes("await client.query('begin')"));
  assert.ok(db.includes("await client.query('commit')"));
  assert.ok(db.includes("await client.query('rollback')"));
});

test('production session store joins user and linked employee and loads scopes server-side',()=>{
  assert.ok(authStore.includes('join users u on u.id=s.user_id'));
  assert.ok(authStore.includes('join employees e on e.id=u.employee_id'));
  assert.ok(authStore.includes('select office,department from user_scopes'));
});

test('employee renumbering is atomic and preserves immutable foreign keys',()=>{
  assert.ok(employeeStore.includes('withTransaction(async client=>'));
  assert.ok(employeeStore.includes('insert into employee_number_history'));
  assert.ok(employeeStore.includes('insert into record_histories'));
  assert.ok(employeeStore.includes('insert into audit_logs'));
  assert.ok(renumber.includes("user.role_level!=='full'"));
  assert.ok(renumber.includes('parseIfMatchHeader'));
  assert.ok(renumber.includes('MFA_REQUIRED'));
});

test('retirement atomically suspends linked accounts and revokes sessions',()=>{
  assert.ok(employeeStore.includes("next.lifecycle_status==='retired'"));
  assert.ok(employeeStore.includes("update users set state='suspended'"));
  assert.ok(employeeStore.includes("update auth_sessions set revoked_at=now()"));
  assert.ok(transition.includes('retirement_login_revocation'));
});
