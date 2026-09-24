const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const base=fs.readFileSync(path.join(__dirname,'..','docs','production-schema.sql'),'utf8');
const capacity=fs.readFileSync(path.join(__dirname,'..','docs','production-capacity-v189.sql'),'utf8');

function indexes(source){
  return [...source.matchAll(/create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)\s+on\s+([a-z0-9_]+)\s*\(([^)]*)\)(?:\s+where\s+([^;]+))?;/gi)]
    .map(m=>({
      name:m[1],
      table:m[2],
      columns:m[3].replace(/\s+/g,' ').trim().toLowerCase(),
      where:(m[4]||'').replace(/\s+/g,' ').trim().toLowerCase()
    }));
}

test('capacity addendum does not duplicate base index names or exact signatures',()=>{
  const baseIndexes=indexes(base);
  const capacityIndexes=indexes(capacity);
  const duplicateNames=capacityIndexes
    .filter(x=>baseIndexes.some(y=>y.name===x.name))
    .map(x=>x.name);
  const duplicateSignatures=capacityIndexes
    .filter(x=>baseIndexes.some(y=>y.table===x.table&&y.columns===x.columns&&y.where===x.where))
    .map(x=>x.name);
  assert.deepEqual(duplicateNames,[]);
  assert.deepEqual(duplicateSignatures,[]);
});

test('capacity addendum keeps monthly near-miss target snapshot and compliance view',()=>{
  assert.match(capacity,/create table if not exists near_miss_monthly_targets/i);
  assert.match(capacity,/unique \(month_start, employee_id\)/i);
  assert.match(capacity,/create or replace view near_miss_monthly_compliance/i);
  assert.match(capacity,/requirement_state = 'exempt'/i);
  assert.match(capacity,/n\.reported_on >= t\.month_start/i);
});
