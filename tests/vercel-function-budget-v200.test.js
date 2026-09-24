const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.join(__dirname,'..');
const vercel=JSON.parse(fs.readFileSync(path.join(root,'vercel.json'),'utf8'));
const router=fs.readFileSync(path.join(root,'api','router.js'),'utf8');

function walk(dir){
  const out=[];
  for(const name of fs.readdirSync(dir)){
    const p=path.join(dir,name),st=fs.statSync(p);
    if(st.isDirectory())out.push(...walk(p));
    else if(st.isFile()&&p.endsWith('.js'))out.push(p)
  }
  return out
}

test('Vercel deploy exposes only one Node function entrypoint',()=>{
  const nodeBuilds=(vercel.builds||[]).filter(x=>x.use==='@vercel/node');
  assert.equal(nodeBuilds.length,1);
  assert.equal(nodeBuilds[0].src,'api/router.js');
  assert.ok((vercel.routes||[]).some(x=>String(x.src).includes('/api/v1')&&String(x.dest).includes('/api/router.js')));
});

test('single router statically includes every v1 handler',()=>{
  const files=walk(path.join(root,'api','v1'));
  assert.ok(files.length>12,'test requires function count to exceed Hobby direct-entry budget');
  for(const abs of files){
    const rel='./v1/'+path.relative(path.join(root,'api','v1'),abs).split(path.sep).join('/');
    assert.ok(router.includes('require('+JSON.stringify(rel)+')'),rel+' missing from single router');
  }
});

test('router restores dynamic route parameters',()=>{
  assert.ok(router.includes("route.keys.forEach"));
  assert.ok(router.includes("query[key]=decodeURIComponent"));
  assert.ok(router.includes("delete query.__path"));
});
