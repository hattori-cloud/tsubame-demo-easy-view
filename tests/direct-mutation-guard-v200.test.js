const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function functionBlock(name){
  const start=source.indexOf('function '+name+'(');
  assert.ok(start>=0,'missing '+name);
  const brace=source.indexOf('{',start);
  let depth=1,i=brace+1,quote=null,escaped=false;
  for(;i<source.length&&depth;i++){
    const ch=source[i];
    if(quote){
      if(escaped){escaped=false;continue}
      if(ch==='\\'){escaped=true;continue}
      if(ch===quote)quote=null;
      continue
    }
    if(ch==="'"||ch==='"'||ch==='\`'){quote=ch;continue}
    if(ch==='{')depth++;
    else if(ch==='}')depth--;
  }
  return source.slice(start,i)
}

test('direct mutation actions check core save readiness before changing in-memory data',()=>{
  const names=[
    'markNoticeRead','answerConfirmation','updateApplicationStatus',
    'confirmHandoffNotice','verifyOriginalDocument','deleteDocument',
    'appendCaseNote','completeTraining','setNotifySetting'
  ];
  for(const name of names){
    const block=functionBlock(name);
    assert.ok(block.includes('coreMutationReady()'),name+' missing pre-mutation save readiness guard');
  }
});

test('coreMutationReady delegates stale-state messaging to save without modifying business arrays',()=>{
  const block=functionBlock('coreMutationReady');
  assert.ok(block.includes('coreSaveRevisionIsCurrent()'));
  assert.ok(block.includes('save();'));
  for(const token of ['E.push','A.push','N.push','C.push','DOCS.push','APPLICATIONS.push']){
    assert.equal(block.includes(token),false,token+' must not appear in readiness guard')
  }
});


test('future direct save actions cannot bypass stale-state guard silently',()=>{
  const allowedInfrastructure=new Set([
    'ensureStableEmployeeReferences',
    'ensureRecordMetadata',
    'save',
    'coreMutationReady',
    'runSystemDiagnosticChecks'
  ]);
  const unguarded=[];
  for(const match of source.matchAll(/function\s+([A-Za-z_$][\w$]*)\s*\([^)]*\)\s*\{/g)){
    const name=match[1],block=functionBlock(name);
    if(!block.includes('save()'))continue;
    if(block.includes('fsave.onclick'))continue;
    if(allowedInfrastructure.has(name))continue;
    if(!block.includes('coreMutationReady()'))unguarded.push(name);
  }
  assert.deepEqual(unguarded,[]);
});
