const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('top-level uppercase constants do not depend on later uppercase constants',()=>{
  const constants=[...source.matchAll(/^\s*const\s+([A-Z][A-Z0-9_]*)\s*=([^;]*);/gm)]
    .map(m=>({name:m[1],expr:m[2],pos:m.index}));
  const positions=new Map(constants.map(x=>[x.name,x.pos]));
  const violations=[];
  for(const item of constants){
    const refs=[...item.expr.matchAll(/\b([A-Z][A-Z0-9_]{2,})\b/g)]
      .map(m=>m[1])
      .filter(name=>name!==item.name);
    for(const ref of new Set(refs)){
      const declared=positions.get(ref);
      if(declared!==undefined&&declared>item.pos){
        violations.push(item.name+' -> '+ref);
      }
    }
  }
  assert.deepEqual(violations,[]);
});
