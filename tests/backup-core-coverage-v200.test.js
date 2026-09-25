const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function quotedKeys(block){
  return [...block.matchAll(/['"]([^'"]+)['"]/g)].map(m=>m[1]);
}

test('system backup covers every canonical core-save key except legacy mirror',()=>{
  const coreStart=source.indexOf('function coreSaveItems(){');
  const coreEnd=source.indexOf('const CORE_REVISION_KEY=',coreStart);
  assert.ok(coreStart>=0&&coreEnd>coreStart);
  const coreBlock=source.slice(coreStart,coreEnd);
  const coreKeys=[...coreBlock.matchAll(/\[['"]([^'"]+)['"],/g)].map(m=>m[1]);

  const backupStart=source.indexOf('const SYSTEM_BACKUP_ARRAY_KEYS=');
  const backupEnd=source.indexOf('let PENDING_SYSTEM_BACKUP=',backupStart);
  assert.ok(backupStart>=0&&backupEnd>backupStart);
  const backupBlock=source.slice(backupStart,backupEnd);
  const backupKeys=new Set(quotedKeys(backupBlock));

  const canonicalCore=coreKeys.filter(key=>key!=='v23E');
  const missing=canonicalCore.filter(key=>!backupKeys.has(key));
  assert.deepEqual(missing,[]);
});

test('backup payload explicitly includes monthly near-miss targets and document rules',()=>{
  const start=source.indexOf('function systemBackupData(){');
  const end=source.indexOf('function systemBackupCounts',start);
  const block=source.slice(start,end);
  assert.ok(block.includes('v197NEAR_QUOTA_TARGETS:NEAR_QUOTA_TARGETS'));
  assert.ok(block.includes('v200DOCUMENT_RULES:DOCUMENT_RULES'));
});
