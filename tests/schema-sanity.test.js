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
  assert.equal(tables.length,20);
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
