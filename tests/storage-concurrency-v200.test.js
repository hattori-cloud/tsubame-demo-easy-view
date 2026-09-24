const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('audit-only and favorites storage writes do not trigger stale business-data lock',()=>{
  assert.match(source,/const CORE_CONCURRENCY_IGNORE_KEYS=new Set\(\['v29AUDIT','v30FAVORITES'\]\)/);
  const start=source.indexOf("window.addEventListener('storage',e=>{");
  const end=source.indexOf("window.addEventListener('beforeunload'",start);
  assert.ok(start>=0&&end>start);
  const block=source.slice(start,end);
  assert.ok(block.includes('!CORE_CONCURRENCY_IGNORE_KEYS.has(e.key)'));
});

test('business data and revision changes remain concurrency-tracked',()=>{
  const coreStart=source.indexOf('function coreSaveItems(){');
  const coreEnd=source.indexOf('const CORE_REVISION_KEY=',coreStart);
  const core=source.slice(coreStart,coreEnd);
  for(const key of ['v45E','v23A','v46NEAR','v46COMPLAINT','v30DOCS','v197NEAR_QUOTA_TARGETS','v200DOCUMENT_RULES']){
    assert.ok(core.includes("'"+key+"'"),key+' must remain a core tracked data key');
  }
  const listener=source.slice(
    source.indexOf("window.addEventListener('storage',e=>{"),
    source.indexOf("window.addEventListener('beforeunload'")
  );
  assert.ok(listener.includes('e.key===CORE_REVISION_KEY'));
  assert.ok(listener.includes('coreSaveItems().some'));
});
