const fs=require('fs');
const assert=require('assert');

const html=fs.readFileSync('index.html','utf8');
const scripts=[...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)]
  .map(m=>m[1])
  .filter(s=>s.trim());

assert(scripts.length>0,'inline JavaScript not found');

scripts.forEach((source,index)=>{
  assert.doesNotThrow(
    ()=>new Function(source),
    undefined,
    'inline JavaScript syntax error in script '+(index+1)
  );
});

console.log('index-script-syntax-v200: OK');
