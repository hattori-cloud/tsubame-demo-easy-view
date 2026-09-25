const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const vm=require('node:vm');

const source=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function extractFunction(name,nextName){
  const start=source.indexOf('function '+name+'(');
  const end=source.indexOf('function '+nextName+'(',start);
  assert.ok(start>=0&&end>start,'missing '+name);
  return source.slice(start,end)
}

const context={};
vm.createContext(context);
vm.runInContext(extractFunction('backupReferenceChecks','backupIdChecks'),context);

function baseData(){
  return {
    v45E:[{no:'1001'},{no:'1002'}],
    v23A:[],v23V:[{id:'V-1',employee_no:'1001',additionalEmployeeNos:['1002']}],
    v46NEAR:[],v46COMPLAINT:[],v23TR:[],v23AS:[],
    v28QUAL:[{id:'Q-1',employee_no:'1001',document_id:'D-1'}],
    v30GUIDANCE:[],
    v30DOCS:[{id:'D-1',employee_no:'1001',qualification_id:'Q-1',replacedFromDocumentId:'',replacedByDocumentId:''}],
    v65APPLICATIONS:[],v68HANDOFFS:[]
  }
}

test('valid backup relations pass reference validation',()=>{
  const result=context.backupReferenceChecks(baseData());
  assert.deepEqual([...result.errors],[])
});

test('missing additional vehicle user blocks restore',()=>{
  const data=baseData();
  data.v23V[0].additionalEmployeeNos.push('9999');
  const result=context.backupReferenceChecks(data);
  assert.ok(result.errors.some(x=>x.includes('追加利用乗務員 9999')))
});

test('dangling qualification and document links block restore',()=>{
  const data=baseData();
  data.v28QUAL[0].document_id='D-missing';
  data.v30DOCS[0].qualification_id='Q-missing';
  const result=context.backupReferenceChecks(data);
  assert.ok(result.errors.some(x=>x.includes('関連書類 D-missing')));
  assert.ok(result.errors.some(x=>x.includes('関連資格 Q-missing')))
});

test('dangling replacement document link blocks restore',()=>{
  const data=baseData();
  data.v30DOCS[0].replacedByDocumentId='D-missing';
  const result=context.backupReferenceChecks(data);
  assert.ok(result.errors.some(x=>x.includes('差替え参照 D-missing')))
});
