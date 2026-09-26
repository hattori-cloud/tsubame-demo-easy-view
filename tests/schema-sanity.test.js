const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sql=fs.readFileSync(path.join(__dirname,'..','docs','production-schema.sql'),'utf8');

function duplicates(values){
  const counts=new Map();
  values.forEach(v=>counts.set(v,(counts.get(v)||0)+1));
  return [...counts.entries()].filter(([,n])=>n>1)
}

test('production schema declares each table once',()=>{
  const tables=[...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi)].map(m=>m[1]);
  assert.equal(tables.length,23);
  assert.deepEqual(duplicates(tables),[])
});

test('production schema index names are unique',()=>{
  const indexes=[...sql.matchAll(/create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi)].map(m=>m[1]);
  assert.ok(indexes.length>=30);
  assert.deepEqual(duplicates(indexes),[])
});

test('three-digit car number checks are complete',()=>{
  const checks=[...sql.matchAll(/car_no[^\n]*check\s*\([^\n]*/gi)].map(m=>m[0]);
  assert.ok(checks.length>=4);
  checks.forEach(line=>assert.match(line,/\^\[0-9\]\{3\}\$/))
});

test('schema transaction is balanced',()=>{
  assert.match(sql,/^begin;/mi);
  assert.match(sql,/^commit;/mi)
});

test('document policy rules enforce strict security',()=>{
  assert.match(sql,/create table document_policy_rules/i);
  assert.match(sql,/security_class <> 'strict' or access_level = 'full_admin'/);
  assert.match(sql,/security_class <> 'strict' or verification_required = true/);
  assert.match(sql,/retention_years is null or retention_years between 1 and 99/)
});

test('document storage lifecycle and purge approval are fail-closed',()=>{
  assert.match(sql,/storage_state text not null default 'not_uploaded'/);
  assert.match(sql,/storage_state in \('not_uploaded','quarantine','active','blocked','restore_only','purged'\)/);
  assert.match(sql,/uploaded_by_user_id uuid references users\(id\)/);
  assert.match(sql,/content_sha256 char\(64\)/);
  assert.match(sql,/create table document_purge_requests/i);
  assert.match(sql,/approved_by_user_id <> requested_by_user_id/);
  assert.match(sql,/state in \('requested','approved','rejected','executed','failed','cancelled'\)/);
});


test('accident evidence links preserve document security boundaries',()=>{
  assert.match(sql,/create table accident_documents/i);
  assert.match(sql,/accident_id uuid not null references accidents\(id\) on delete cascade/i);
  assert.match(sql,/document_id uuid not null references documents\(id\)/i);
  assert.match(sql,/role in \('scene_photo','sketch','vehicle_damage','opponent_damage','police','estimate','other'\)/i);
  assert.match(sql,/unique \(accident_id, document_id\)/i);
});
