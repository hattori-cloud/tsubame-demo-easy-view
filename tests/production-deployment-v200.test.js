const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const cfg=JSON.parse(fs.readFileSync(path.join(__dirname,'..','vercel.json'),'utf8'));

test('Vercel serves production API UI assets before the demo fallback route',()=>{
  const builds=new Set(cfg.builds.map(x=>x.src));
  for(const src of ['production.html','production-app.js','production.css'])assert.ok(builds.has(src),src);
  const sources=cfg.routes.map(x=>x.src);
  const fallback=sources.indexOf('/(.*)');
  for(const src of ['/production(?:\\.html)?','/production-app\\.js','/production\\.css']){
    const i=sources.indexOf(src);
    assert.ok(i>=0,src+' route missing');
    assert.ok(i<fallback,src+' must be before demo fallback')
  }
});

test('API router remains ahead of static production routes',()=>{
  assert.ok(String(cfg.routes[0].src).startsWith('/api/v1'));
  assert.equal(cfg.routes[0].dest,'/api/router.js?__path=$1');
});
