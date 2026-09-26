const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

test('demo navigation reflects selected-user operation with seven manager menus',()=>{
  const nav=(html.match(/<nav id="nav">[\s\S]*?<\/nav>/)||[''])[0];
  for(const label of ['ホーム','社員','期限・勤務','運行・安全','分析','車両','管理'])assert.ok(nav.includes('>'+label+'</button>'),label);
  assert.equal(nav.includes('data-p="my"'),false);
  assert.equal(nav.includes('data-p="comms"'),false);
  assert.equal(nav.includes('掲示・申請'),false)
});

test('demo role selector no longer offers general employee self mode',()=>{
  const start=html.indexOf('<select id="rolePreview"');
  const end=html.indexOf('</select>',start);
  const roleSelect=html.slice(start,end+9);
  assert.ok(roleSelect.includes('value="full"'));
  assert.ok(roleSelect.includes('value="scoped"'));
  assert.equal(roleSelect.includes('value="self"'),false);
  assert.ok(html.includes("if(!['full','scoped'].includes(PREVIEW_MODE))"));
  assert.ok(html.includes("if(!['full','scoped'].includes(mode))mode='full'"))
});

test('retired notice and application categories are removed from visible global search',()=>{
  const start=html.indexOf('<select id="gtype"');
  const end=html.indexOf('</select>',start);
  const select=html.slice(start,end+9);
  assert.equal(select.includes('value="application"'),false);
  assert.equal(select.includes('value="comms"'),false);
  const searchStart=html.indexOf('function searchAll(){');
  const searchEnd=html.indexOf('function openEmployeeEdit',searchStart);
  const search=html.slice(searchStart,searchEnd);
  assert.equal(search.includes("label:'申請'"),false);
  assert.equal(search.includes("label:'掲示'"),false)
});

test('legacy self and comms pages are guarded away from direct demo navigation',()=>{
  assert.ok(html.includes("if(['my','comms'].includes(id))id='home'"));
  assert.ok(html.includes("USERS.filter(u=>u.role==='管理者')"))
});
