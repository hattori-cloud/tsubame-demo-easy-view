const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function sliceBetween(startToken,endToken){
  const start=source.indexOf(startToken);
  const end=source.indexOf(endToken,start);
  assert.ok(start>=0&&end>start,'missing '+startToken);
  return source.slice(start,end)
}

const helperSource=sliceBetween('function auditFingerprint','function persistAuditStandalone');
const context={};
vm.createContext(context);
vm.runInContext('const AUDIT_RETENTION_LIMIT=3000;\n'+helperSource,context);

test('audit merge keeps unique rows from both tabs and sorts newest first',()=>{
  const a={time_iso:'2026-09-24T05:00:00.000Z',actor_id:'A',action:'閲覧',entity_type:'employee',entity_id:'1001',employee_no:'1001',detail:'社員詳細'};
  const b={time_iso:'2026-09-24T05:00:01.000Z',actor_id:'B',action:'閲覧',entity_type:'employee',entity_id:'1002',employee_no:'1002',detail:'社員詳細'};
  const merged=context.mergeAuditRows([a],[b]);
  assert.equal(merged.length,2);
  assert.equal(merged[0].actor_id,'B');
  assert.equal(merged[1].actor_id,'A');
});

test('audit merge de-duplicates the same event fingerprint',()=>{
  const row={time_iso:'2026-09-24T05:00:00.000Z',actor_id:'A',action:'事故閲覧',entity_type:'accident',entity_id:'A-1',employee_no:'1001',detail:'A-1'};
  const merged=context.mergeAuditRows([row],[{...row}]);
  assert.equal(merged.length,1);
});
