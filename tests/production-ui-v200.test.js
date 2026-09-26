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
  for(const p of ['/employees','/deadlines','/accidents','/complaints','/vehicles','/near-misses','/analysis/management-summary','/users','/audit-logs'])assert.ok(js.includes(p),p);
  assert.equal(html.includes('1001'),false);
});

test('session identity includes immutable employee id and runtime data mode for selected users',()=>{
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


test('selected-user production UI integrates handoffs and guidance into safety without self-service communication calls',()=>{
  assert.ok(js.includes("['handoffs','引継ぎ']"));
  assert.ok(js.includes("api('/handoffs')"));
  assert.ok(js.includes("api('/guidance?page_size=8')"));
  assert.ok(js.includes('引継ぎ未確認'));
  assert.ok(js.includes('安全指導・次回確認'));
  assert.equal(js.includes("hubButton('business'"),false);
  assert.equal(js.includes("async function renderBusiness()"),false);
  for(const retired of ['/notices','/confirmations','/applications'])assert.equal(js.includes(retired),false,retired);
  assert.equal(js.includes('notices_workflow'),false);
  assert.ok(html.includes('data-view="safety">運行・安全</button>'));
});


test('production top navigation is reduced to the same seven manager-focused areas as the demo',()=>{
  const nav=(html.match(/<nav id="nav">[\s\S]*?<\/nav>/)||[''])[0];
  for(const label of ['ホーム','社員','期限・勤務','運行・安全','分析','車両','管理'])assert.ok(nav.includes('>'+label+'</button>'),label);
  for(const retired of ['>事故</button>','>苦情</button>','>ヒヤリ</button>','>資格・書類</button>','>勤務取込</button>','>利用者管理</button>','>引継ぎ</button>'])assert.equal(nav.includes(retired),false,retired);
});

test('production grouped navigation keeps child APIs connected as end-to-end task paths',()=>{
  assert.ok(js.includes("const NAV_PARENT={deadlines:'work'"));
  assert.ok(js.includes("users:'admin',audit:'admin'"));
  assert.ok(js.includes("async function renderWorkHub()"));
  assert.ok(js.includes("async function renderSafetyHub()"));
  assert.ok(js.includes("async function renderAdminHub()"));
  assert.ok(js.includes("data-action=\"open-view\""));
  assert.ok(js.includes("data-dialog-action=\"open-employee-credentials\""));
  assert.ok(js.includes("data-dialog-action=\"open-employee-accidents\""));
  assert.ok(js.includes("data-dialog-action=\"open-employee-complaints\""));
  assert.ok(js.includes("data-dialog-action=\"open-employee-near\""));
  assert.ok(js.includes("data-action=\"open-employee\""));
  assert.ok(css.includes('.hub-grid'));
});


test('training and loaned assets are integrated into employee detail instead of a top-level menu',()=>{
  assert.ok(js.includes("api('/training?employee_id='"));
  assert.ok(js.includes("api('/assets?employee_id='"));
  assert.ok(js.includes('function employeeSupportHtml'));
  assert.ok(js.includes('function newTrainingForEmployee'));
  assert.ok(js.includes('function editTrainingForEmployee'));
  assert.ok(js.includes('function newAssetForEmployee'));
  assert.ok(js.includes('function editAssetForEmployee'));
  assert.ok(js.includes("canEdit('assets_training')"));
  const nav=(html.match(/<nav id="nav">[\s\S]*?<\/nav>/)||[''])[0];
  assert.equal(nav.includes('教育'),false);
  assert.equal(nav.includes('貸与品'),false);
});


test('home is an operational starting point with permission-aware cross search',()=>{
  assert.ok(js.includes('id="homeGlobalSearch"'));
  assert.ok(js.includes('async function runHomeSearch()'));
  for(const endpoint of ['/employees?page_size=6&q=','/vehicles?page_size=6&q=','/accidents?page_size=6&q=','/complaints?page_size=6&q=','/near-misses?page_size=6&q='])assert.ok(js.includes(endpoint),endpoint);
  assert.ok(js.includes("data-action=\"home-search\""));
  assert.ok(js.includes("data-action=\"open-filtered-view\""));
});

test('management keeps work import in work flow and uses management for users and audit',()=>{
  assert.ok(js.includes("hubButton('users','利用者・権限'"));
  assert.ok(js.includes("hubButton('audit','監査ログ'"));
  assert.ok(js.includes("async function renderAuditLogs(q)"));
  const adminStart=js.indexOf('async function renderAdminHub()');
  const adminEnd=js.indexOf('async function renderDeadlines',adminStart);
  const admin=js.slice(adminStart,adminEnd);
  assert.equal(admin.includes("hubButton('work-import'"),false);
  const workStart=js.indexOf('async function renderWorkHub()');
  const workEnd=js.indexOf('async function renderSafetyHub()',workStart);
  assert.ok(js.slice(workStart,workEnd).includes("hubButton('work-import'"));
});

test('analysis connects current management workload, safety history and operational follow-up',()=>{
  assert.ok(js.includes("api('/analysis/management-summary'"));
  assert.ok(js.includes('現在の人員状況'));
  assert.ok(js.includes('今対応が必要なこと'));
  assert.ok(js.includes('横断して確認する人数'));
  assert.ok(js.includes('現在所属別の人員・対応状況'));
  assert.ok(js.includes('安全分析'));
  assert.ok(js.includes('安全記録 月別推移'));
  assert.ok(js.includes('安全記録 部署別比較'));
  assert.ok(js.includes('分析から次の処理へ'));
  assert.ok(js.includes("hubButton('employees','社員を確認'"));
  assert.ok(js.includes("hubButton('deadlines','期限を確認'"));
  assert.ok(js.includes("hubButton('credentials','資格・書類を確認'"));
  assert.ok(js.includes("hubButton('work-import','勤務を確認'"));
  assert.ok(js.includes("hubButton('safety','運行・安全を確認'"));
});


test('safety records and vehicle records cross-link employees and car numbers',()=>{
  assert.ok(js.includes('data-id="vehicles" data-q="'));
  assert.ok(js.includes('>号車</button>'));
  assert.ok(js.includes('>担当社員</button>'));
  assert.ok(js.includes("data-action=\"open-employee\""));
});


test('employee detail is an operational hub for deadlines vehicles and safety history',()=>{
  assert.ok(js.includes('function employeeOperationalHtml'));
  assert.ok(js.includes("data-dialog-action=\"open-employee-deadlines\""));
  assert.ok(js.includes("data-dialog-action=\"open-employee-vehicles\""));
  assert.ok(js.includes("data-dialog-action=\"open-employee-vehicle\""));
  assert.ok(js.includes("'/deadlines?filter=action&page_size=6&q='"));
  assert.ok(js.includes("'/vehicles?page_size=6&q='"));
  assert.ok(js.includes("'/accidents?page_size=1&q='"));
  assert.ok(js.includes("'/complaints?page_size=1&q='"));
  assert.ok(js.includes("'/near-misses?page_size=1&q='"));
  assert.ok(css.includes('.support-stat-grid'));
  assert.ok(css.includes('@media(max-width:390px){.support-stat-grid'));
});

test('deadline rows lead directly to the employee or vehicle that must be handled',()=>{
  assert.ok(js.includes("x.type==='vehicle_inspection'||x.type==='vehicle_maintenance'"));
  assert.ok(js.includes('data-action="edit-vehicle" data-id="'));
  assert.ok(js.includes('data-action="open-employee" data-id="'));
});


test('vehicle assignment UI uses searchable employee references instead of a huge employee dropdown',()=>{
  assert.ok(js.includes('async function resolveEmployeeReference'));
  assert.ok(js.includes("'/employees?page_size=20&q='"));
  assert.ok(js.includes('async function editVehicleAssignments'));
  assert.ok(js.includes('担当乗務員・区分を変更'));
  assert.ok(js.includes("'/vehicles/'+encodeURIComponent(v.id)+'/assignments'"));
  assert.ok(js.includes("additional_employee_ids:additionalIds"));
  assert.ok(js.includes("headers:{'If-Match':"));
});


test('large employee population workflows use searchable references instead of a 100-row select cap',()=>{
  assert.equal(js.includes('employeeChoices()'),false);
  assert.equal(js.includes("api('/employees?page_size=100')"),false);
  assert.ok(js.includes("formField('employee_ref','対象社員（社員番号または氏名）'"));
  assert.ok(js.includes("resolveEmployeeReference(fdText(fd,'employee_ref'))"));
  assert.ok(js.includes("formField('primary_employee','主担当（社員番号または氏名）'"));
  assert.ok(js.includes("resolveEmployeeReference(primaryRef)"));
});


test('large production lists paginate instead of silently stopping at the first 50 rows',()=>{
  assert.ok(js.includes('function paginationHtml'));
  assert.ok(js.includes("if(action==='list-page')"));
  for(const view of ['employees','deadlines','accidents','complaints','vehicles','near-misses','credentials','users','audit']){
    assert.ok(js.includes("paginationHtml(data,'"+view+"',q)"),view);
  }
  assert.ok(js.includes("page:String(page)"));
  assert.ok(js.includes("resetPage:true"));
  assert.ok(css.includes('.list-pager'));
  assert.ok(css.includes('@media(max-width:390px){.list-pager'));
});


test('filtered navigation keeps the visible search box synchronized and clears stale cross-view queries',()=>{
  assert.ok(js.includes("Object.prototype.hasOwnProperty.call(opts,'q')"));
  assert.ok(js.includes("$('searchInput').value=String(opts.q||'')"));
  assert.ok(js.includes("previousView!==view||opts.resetPage"));
});


test('production analysis labels current-vs-historical aggregation bases to avoid false comparisons',()=>{
  assert.ok(js.includes('安全は記録時所属、人員系は現在所属'));
  assert.ok(js.includes("a.notes?.workforce_basis"));
  assert.ok(js.includes("a.notes?.safety_basis"));
  assert.ok(js.includes("a.notes?.cross_basis"));
  assert.ok(js.includes('順位付けではなく業務確認用'));
});

test('production analysis only renders management modules that the API marks as accessible',()=>{
  assert.ok(js.includes('const workforce=a.workforce||null'));
  assert.ok(js.includes('if(deadlines)'));
  assert.ok(js.includes('if(credentials)'));
  assert.ok(js.includes('if(support)'));
  assert.ok(js.includes('if(vehicles)'));
  assert.ok(js.includes('if(work)'));
  assert.ok(js.includes('if(access.employees)'));
  assert.ok(js.includes('if(access.deadlines)'));
  assert.ok(js.includes('if(access.credentials)'));
  assert.ok(js.includes('if(access.vehicles)'));
  assert.ok(js.includes('if(access.work_import)'));
});


test('management analysis connects vehicle inspection and maintenance workload to the vehicle view',()=>{
  assert.ok(js.includes('車検超過'));
  assert.ok(js.includes('整備予定超過'));
  assert.ok(js.includes("hubButton('vehicles','車両を確認'"));
});
