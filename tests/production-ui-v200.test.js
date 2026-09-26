const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const js=fs.readFileSync(path.join(__dirname,'..','production-app.js'),'utf8');
const html=fs.readFileSync(path.join(__dirname,'..','production.html'),'utf8');
const css=fs.readFileSync(path.join(__dirname,'..','production.css'),'utf8');
const vercel=fs.readFileSync(path.join(__dirname,'..','vercel.json'),'utf8');

test('production UI JavaScript parses cleanly',()=>assert.doesNotThrow(()=>new Function(js)));

test('production UI keeps business records out of browser storage',()=>{
  assert.equal(js.includes('localStorage'),false);
  assert.equal(js.includes('sessionStorage'),false);
});

test('production API client uses same-origin cookie session and no-store requests',()=>{
  assert.ok(js.includes("fetch('/api/v1'+path"));
  assert.ok(js.includes("credentials:'same-origin'"));
  assert.ok(js.includes("cache:'no-store'"));
});

test('production auth shell covers password, MFA and logout',()=>{
  for(const p of ['/auth/login','/auth/mfa/enroll/start','/auth/mfa/enroll/complete','/auth/mfa/verify','/auth/logout','/me'])assert.ok(js.includes(p),p);
  assert.ok(html.includes('autocomplete="current-password"'));
  assert.ok(html.includes('autocomplete="one-time-code"'));
});

test('production shell covers primary server-backed operational views',()=>{
  for(const p of ['/employees','/deadlines','/accidents','/complaints','/vehicles','/near-misses','/analysis/safety-summary','/users'])assert.ok(js.includes(p),p);
  assert.equal(html.includes('1001'),false);
});

test('session identity includes employee id and runtime data mode for self-service views',()=>{
  const me=fs.readFileSync(path.join(__dirname,'..','api','v1','me.js'),'utf8');
  assert.ok(me.includes('employee_id:user.employee_id'));
  assert.ok(me.includes("stagingFixturesAllowed()?'fictional-staging-fixtures':'postgres'"));
  assert.equal(me.includes("data_mode:'fictional-staging-fixtures'"),false);
});

test('credential view uses current employee credentials endpoint and does not expose unsupported document creation',()=>{
  assert.ok(js.includes("'/employees/'+encodeURIComponent(employeeId)+'/credentials'"));
  assert.equal(js.includes("api('/credentials?employee_id="),false);
  assert.equal(js.includes("api('/document-policies')"),false);
  assert.equal(js.includes('data-action="new-document"'),false);
  assert.equal(js.includes('data-action="new-original-document"'),false);
});

test('work import UI uses persisted batch and If-Match lifecycle',()=>{
  assert.ok(js.includes("'/work-import/batches/'+encodeURIComponent(current.batch.id)+'/commit'"));
  assert.ok(js.includes("'/work-import/batches/'+encodeURIComponent(batch.id)+'/rollback'"));
  assert.ok(js.includes("'If-Match':'\"'+current.batch.version+'\"'"));
  assert.ok(js.includes("'If-Match':'\"'+batch.version+'\"'"));
  assert.equal(js.includes('/work-import/history'),false);
  assert.equal(js.includes('/work-import/commit?'),false);
});

test('production UI has desktop, 390px and 320px responsive rules',()=>{
  assert.ok(css.includes('@media(max-width:780px)'));
  assert.ok(css.includes('@media(max-width:390px)'));
  assert.ok(css.includes('@media(max-width:320px)'));
});

test('production files are explicit Vercel static routes',()=>{
  assert.ok(vercel.includes('"src": "production.html"'));
  assert.ok(vercel.includes('"src": "production-app.js"'));
  assert.ok(vercel.includes('"src": "production.css"'));
  assert.ok(vercel.includes('"src": "/production(?:\\\\.html)?"'));
});


test('selected-user production UI exposes handoffs but no employee self-service communication calls',()=>{
  assert.ok(js.includes("business:'handoffs'"));
  assert.ok(js.includes("['handoffs','引継ぎ']"));
  assert.ok(js.includes("api('/handoffs')"));
  for(const retired of ['/notices','/confirmations','/applications'])assert.equal(js.includes(retired),false,retired);
  assert.equal(js.includes('notices_workflow'),false);
  assert.ok(html.includes('data-view="safety">運行・安全</button>'));
  assert.ok(js.includes("hubButton('business','引継ぎ・指導'"))
});


test('production top navigation is reduced to the same seven manager-focused areas as the demo',()=>{
  const nav=(html.match(/<nav id="nav">[\s\S]*?<\/nav>/)||[''])[0];
  for(const label of ['ホーム','社員','期限・勤務','運行・安全','分析','車両','管理'])assert.ok(nav.includes('>'+label+'</button>'),label);
  for(const retired of ['>事故</button>','>苦情</button>','>ヒヤリ</button>','>資格・書類</button>','>勤務取込</button>','>利用者管理</button>','>引継ぎ</button>'])assert.equal(nav.includes(retired),false,retired);
});

test('production grouped navigation keeps child APIs accessible from hubs and employee detail',()=>{
  assert.ok(js.includes("const NAV_PARENT={deadlines:'work'"));
  assert.ok(js.includes("async function renderWorkHub()"));
  assert.ok(js.includes("async function renderSafetyHub()"));
  assert.ok(js.includes("async function renderAdminHub()"));
  assert.ok(js.includes("data-action=\"open-view\""));
  assert.ok(js.includes("data-dialog-action=\"open-employee-credentials\""));
  assert.ok(css.includes('.hub-grid'));
});
