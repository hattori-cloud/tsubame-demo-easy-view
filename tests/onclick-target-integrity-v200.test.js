const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('inline onclick handlers only call functions defined by the application or browser globals',()=>{
  const handlers=[...source.matchAll(/\bonclick=(["'])(.*?)\1/g)].map(m=>m[2]);
  assert.ok(handlers.length>0,'no onclick handlers found');

  const defined=new Set([
    ...[...source.matchAll(/\bfunction\s+([A-Za-z_$][\w$]*)\s*\(/g)].map(m=>m[1]),
    ...[...source.matchAll(/\b(?:const|let|var)\s+([A-Za-z_$][\w$]*)\s*=\s*(?:async\s*)?(?:\([^)]*\)|[A-Za-z_$][\w$]*)\s*=>/g)].map(m=>m[1])
  ]);
  const allowedGlobals=new Set([
    'alert','confirm','prompt','setTimeout','clearTimeout','requestAnimationFrame',
    'parseInt','parseFloat','Number','String','Boolean','Date','Math','JSON',
    'encodeURIComponent','decodeURIComponent'
  ]);

  const called=new Set();
  for(const handler of handlers){
    for(const match of handler.matchAll(/(^|[^.\w$])([A-Za-z_$][\w$]*)\s*\(/g)){
      called.add(match[2]);
    }
  }
  const missing=[...called].filter(name=>!defined.has(name)&&!allowedGlobals.has(name)).sort();
  assert.deepEqual(missing,[]);
});
