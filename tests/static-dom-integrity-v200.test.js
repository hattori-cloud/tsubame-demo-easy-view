const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const staticHtml=html.slice(0,html.indexOf('<script'));

test('static page markup has no duplicate element ids',()=>{
  const ids=[...staticHtml.matchAll(/\bid=["']([^"']+)["']/gi)].map(m=>m[1]);
  const seen=new Set(),duplicates=[];
  for(const id of ids){
    if(seen.has(id)&&!duplicates.includes(id))duplicates.push(id);
    seen.add(id);
  }
  assert.deepEqual(duplicates,[]);
});
