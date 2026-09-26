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


test('capacity indexes reference columns available after base plus additive migrations',()=>{
  function tableColumnsFromCreate(sql){
    const map=new Map();
    for(const match of sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)\s*\(([\s\S]*?)\n\);/gi)){
      const columns=new Set();
      for(const line of match[2].split('\n')){
        const column=/^\s*([a-z][a-z0-9_]*)\s+/i.exec(line);
        if(column&&!/^(check|unique|primary|foreign|constraint)$/i.test(column[1]))columns.add(column[1]);
      }
      map.set(match[1],columns);
    }
    return map
  }

  const tables=tableColumnsFromCreate(base);
  for(const match of capacity.matchAll(/alter\s+table\s+([a-z0-9_]+)\s+([\s\S]*?);/gi)){
    const table=match[1];
    assert.ok(tables.has(table),'capacity ALTER target missing from base: '+table);
    for(const addColumn of match[2].matchAll(/add\s+column\s+if\s+not\s+exists\s+([a-z0-9_]+)/gi)){
      tables.get(table).add(addColumn[1]);
    }
  }
  for(const [table,columns] of tableColumnsFromCreate(capacity))tables.set(table,columns);

  const invalid=[];
  for(const match of capacity.matchAll(/create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)\s+on\s+([a-z0-9_]+)\s*\(([^)]*)\)/gi)){
    const [,indexName,tableName,inside]=match;
    if(!tables.has(tableName)){invalid.push(indexName+' -> missing table '+tableName);continue}
    const columns=inside.split(',').map(x=>x.trim().split(/\s+/)[0].replace(/["']/g,'')).filter(Boolean);
    for(const column of columns){
      if(/^[a-z][a-z0-9_]*$/i.test(column)&&!tables.get(tableName).has(column)){
        invalid.push(indexName+' -> '+tableName+'.'+column);
      }
    }
  }
  assert.deepEqual(invalid,[]);
});


test('capacity addendum does not redeclare columns owned by the canonical v200 schema',()=>{
  const forbidden=[
    'alter table employees\n  add column if not exists retired_on',
    'add column if not exists reported_on',
    'add column if not exists summary',
    'add column if not exists employee_no_at_report',
    'add column if not exists office_at_report',
    'add column if not exists department_at_report'
  ];
  forbidden.forEach(text=>assert.equal(capacity.includes(text),false,text+' must remain owned by production-schema.sql'));
});


test('near-miss capacity migration adds source tracking and active duplicate protection',()=>{
  assert.match(capacity,/add column if not exists source_type text not null default 'system'/i);
  assert.match(capacity,/add column if not exists external_ref text/i);
  assert.match(capacity,/near_misses_source_type_check/i);
  assert.match(capacity,/create unique index if not exists near_misses_source_ref_unique/i);
});
