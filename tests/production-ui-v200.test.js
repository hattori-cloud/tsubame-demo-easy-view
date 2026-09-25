const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const js=fs.readFileSync(path.join(__dirname,'..','production-app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','production.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','production.css'),'utf8');

test('production UI JavaScript parses cleanly',()=>{
  assert.doesNotThrow(()=>new Function(js));
});

test('production UI keeps business records out of browser localStorage',()=>{
  assert.equal(js.includes('localStorage'),false);
  assert.equal(js.includes('sessionStorage'),false);
  assert.equal(html.includes('localStorage'),false);
});

test('production API client uses same-origin cookie session and no-store requests',()=>{
  assert.ok(js.includes("fetch('/api/v1'+path"));
  assert.ok(js.includes("credentials:'same-origin'"));
  assert.ok(js.includes("cache:'no-store'"));
  assert.ok(js.includes("const timeout=setTimeout(()=>ctrl.abort(),15000)"));
});

test('production auth flow covers password, MFA enrollment, MFA verification and logout',()=>{
  for(const p of [
    '/auth/login','/auth/mfa/enroll/start','/auth/mfa/enroll/complete','/auth/mfa/verify','/auth/logout','/me'
  ])assert.ok(js.includes(p),p);
  assert.ok(html.includes('autocomplete="current-password"'));
  assert.ok(html.includes('autocomplete="one-time-code"'));
});

test('production read shell covers primary operational views without embedding employee fixtures',()=>{
  for(const p of ['/employees','/deadlines','/accidents','/complaints','/vehicles'])assert.ok(js.includes(p),p);
  assert.equal(html.includes('1001'),false);
  assert.equal(js.includes('安芸 太郎'),false);
  assert.equal(js.includes('広島500'),false);
});

test('self users do not receive manager-only navigation controls',()=>{
  assert.ok(js.includes("for(const view of ['accidents','complaints','vehicles'])"));
  assert.ok(js.includes('button.hidden=!manager'));
});

test('production UI has explicit desktop 390px and 320px responsive rules',()=>{
  assert.ok(css.includes('@media(max-width:780px)'));
  assert.ok(css.includes('@media(max-width:390px)'));
  assert.ok(css.includes('@media(max-width:320px)'));
});

test('production UI escapes API-provided content before HTML insertion',()=>{
  assert.ok(js.includes("const esc=v=>"));
  assert.ok(js.includes("replace(/[&<>"));
  assert.ok(js.includes("esc(e.name)"));
  assert.ok(js.includes("esc(x.summary)"));
});


test('production write flows use server concurrency guards and dedicated terminal endpoints',()=>{
  assert.ok(js.includes("'If-Match':'\"'+e.version+'\"'"));
  assert.ok(js.includes("'If-Match':'\"'+a.version+'\"'"));
  assert.ok(js.includes("'If-Match':'\"'+v.version+'\"'"));
  assert.ok(js.includes("'/'+plural+'/'+encodeURIComponent(record.id)+'/'+operation"));
  assert.ok(js.includes("operation==='reopen'"));
  assert.ok(js.includes("window.prompt('再開理由を入力してください')"));
});

test('production create flows cover employees accidents complaints and vehicles',()=>{
  for(const token of ["action==='new-employee'","action==='new-accident'","action==='new-complaint'","action==='new-vehicle'"])assert.ok(js.includes(token),token);
  for(const token of ["method:'POST',body:{","await api('/employees'","await api('/accidents'","await api('/complaints'","await api('/vehicles'"])assert.ok(js.includes(token),token);
});

test('production UI never mutates completed accident or complaint through normal status patch',()=>{
  assert.equal(js.includes("body.status='completed'"),false);
  assert.equal(js.includes("body.phase='completed'"),false);
  assert.ok(js.includes("data-dialog-action=\"complete-accident\""));
  assert.ok(js.includes("data-dialog-action=\"complete-complaint\""));
});
