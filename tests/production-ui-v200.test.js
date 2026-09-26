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

test('deadline rows open the exact work target instead of a generic employee page',()=>{
  assert.ok(js.includes('function deadlineTargetButton'));
  assert.ok(js.includes('async function openDeadlineTarget'));
  assert.ok(js.includes("if(action==='deadline-target')"));
  assert.ok(js.includes("['qualification','document'].includes(type)"));
  assert.ok(js.includes("['training','asset'].includes(type)"));
  assert.ok(js.includes("['vehicle_inspection','vehicle_maintenance'].includes(type)"));
  assert.ok(js.includes('editQualification(sourceId)'));
  assert.ok(js.includes('editDocumentMetadata(sourceId)'));
  assert.ok(js.includes('editTrainingForEmployee(employee,sourceId)'));
  assert.ok(js.includes('editAssetForEmployee(employee,sourceId)'));
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


test('employee and vehicle context is carried into new safety records without retyping known identifiers',()=>{
  assert.ok(js.includes('function employeeQuickCreateHtml'));
  assert.ok(js.includes('function employeeSuggestedCar'));
  for(const action of ['employee-new-accident','employee-new-complaint','employee-new-near','employee-new-guidance','vehicle-new-accident','vehicle-new-near']){
    assert.ok(js.includes(action),action);
  }
  assert.ok(js.includes('async function newAccident(context={})'));
  assert.ok(js.includes('async function newComplaint(context={})'));
  assert.ok(js.includes('async function newNearMiss(context={})'));
  assert.ok(js.includes('async function newGuidance(context={})'));
  assert.ok(js.includes("const employee=knownEmployee||await resolveEmployeeReference"));
  assert.ok(js.includes("formField('car_no','実際の乗車号車',context.carNo||p.car_no||'')"));
  assert.ok(js.includes("const fixed=(ops?.vehicles?.items||[]).filter(v=>isBasicFixedVehicle(v,employee))"));
  assert.ok(js.includes("基本固定車 "+ "'+fixed[0].car_no+'" +"号車を初期表示（実際の乗車号車へ変更可）"));
});

test('credential pages can update existing qualifications and document metadata with optimistic concurrency',()=>{
  assert.ok(js.includes('state.credentialData=data'));
  assert.ok(js.includes('data-action="edit-qualification"'));
  assert.ok(js.includes('data-action="edit-document"'));
  assert.ok(js.includes('function editQualification(id)'));
  assert.ok(js.includes('function editDocumentMetadata(id)'));
  assert.ok(js.includes("'/qualifications/'+encodeURIComponent(q.id)"));
  assert.ok(js.includes("'/documents/'+encodeURIComponent(d.id)"));
  assert.ok(js.includes("q.version"));
  assert.ok(js.includes("d.version"));
  assert.ok(js.includes("headers:{'If-Match':"));
});


test('deadline view exposes explicit quick filters and labels the actual date window',()=>{
  assert.ok(js.includes("deadlineFilter:'action'"));
  assert.ok(js.includes("filterLabels={action:'要対応（超過〜30日）'"));
  assert.ok(js.includes("['all60','60日全体']"));
  assert.ok(js.includes("if(action==='deadline-filter')"));
  assert.ok(js.includes("metric('表示件数'"));
  assert.equal(js.includes("metric('全件',data.summary.total,'60日以内')"),false);
  assert.ok(css.includes('.deadline-filters'));
  assert.ok(css.includes('@media(max-width:390px){.deadline-filters'));
});


test('full administrators can use audited employee transition and renumber workflows from employee detail',()=>{
  assert.ok(js.includes('data-dialog-action="transition-employee"'));
  assert.ok(js.includes('data-dialog-action="renumber-employee"'));
  assert.ok(js.includes('function transitionEmployeeForm(employee)'));
  assert.ok(js.includes('function changeEmployeeNumberForm(employee)'));
  assert.ok(js.includes("'/employees/'+encodeURIComponent(employee.id)+'/transition'"));
  assert.ok(js.includes("'/employees/'+encodeURIComponent(employee.id)+'/employee-number'"));
  assert.ok(js.includes("formArea('reason','変更理由'"));
  assert.ok(js.includes("headers:{'If-Match':"));
});


test('read-only vehicle users can still start permitted safety records without gaining vehicle edit rights',()=>{
  assert.ok(js.includes("if(!canEdit('vehicles'))"));
  assert.ok(js.includes("canEdit('accidents')?'<button type=\"button\" class=\"ghost light\" data-dialog-action=\"vehicle-new-accident\""));
  assert.ok(js.includes("canEdit('near_misses')?'<button type=\"button\" class=\"ghost light\" data-dialog-action=\"vehicle-new-near\""));
  assert.ok(js.includes("openReadOnlyDialog('車両 '+v.car_no+'号車'"));
  assert.ok(js.includes("{actions:quick}"));
});


test('employee detail shows renumber and lifecycle history beside current data',()=>{
  assert.ok(js.includes('function employeeHistoryHtml(history)'));
  assert.ok(js.includes('history?.number_changes'));
  assert.ok(js.includes('history?.transitions'));
  assert.ok(js.includes('社員番号変更と異動・在籍状態の変更履歴'));
  assert.ok(js.includes("employeeHistoryHtml(data.history)"));
});


test('safety cases can create handoffs without entering internal user ids and recipients can reopen the case',()=>{
  assert.ok(js.includes('async function createHandoffForm(context)'));
  assert.ok(js.includes("'/handoffs/targets?employee_id='"));
  assert.ok(js.includes("formSelect('to_user_id','引継ぎ先'"));
  assert.ok(js.includes("api('/handoffs',{method:'POST'"));
  assert.ok(js.includes('data-dialog-action="handoff-accident"'));
  assert.ok(js.includes('data-dialog-action="handoff-complaint"'));
  assert.ok(js.includes('data-action="new-handoff-near"'));
  assert.ok(js.includes('function handoffCaseButton(x)'));
  assert.ok(js.includes('>案件を開く</button>'));
});


test('read-only accident and complaint users can create permitted handoffs without gaining case edit rights',()=>{
  assert.ok(js.includes("if(!canEdit('accidents'))"));
  assert.ok(js.includes("if(!canEdit('complaints'))"));
  assert.ok(js.includes("canEdit('handoffs')?'<button type=\"button\" class=\"ghost light\" data-dialog-action=\"handoff-accident\""));
  assert.ok(js.includes("canEdit('handoffs')?'<button type=\"button\" class=\"ghost light\" data-dialog-action=\"handoff-complaint\""));
  assert.ok(js.includes("{actions:quick}"));
});


test('safety registration uses server drafts with optimistic concurrency and no browser persistence',()=>{
  assert.ok(js.includes('async function loadSafetyDraft(kind)'));
  assert.ok(js.includes('async function deleteSafetyDraft(kind)'));
  assert.ok(js.includes('data-draft-save'));
  assert.ok(js.includes("method:'PUT'"));
  assert.ok(js.includes("headers=draftState?{'If-Match':"));
  assert.ok(js.includes("loadSafetyDraft('accident')"));
  assert.ok(js.includes("loadSafetyDraft('complaint')"));
  assert.ok(js.includes("loadSafetyDraft('near_miss')"));
  assert.ok(js.includes('下書き復元'));
  assert.equal(js.includes('localStorage'),false);
  assert.equal(js.includes('sessionStorage'),false);
});

test('employee-scoped safety forms do not mix a draft saved for another employee',()=>{
  assert.ok(js.includes('function draftPayloadForContext(draft,employee)'));
  assert.ok(js.includes("String(p.employee_id)!==String(employee.id)"));
  assert.ok(js.includes("const compatible=!knownEmployee||!draft||String(draft.payload?.employee_id||'')===String(knownEmployee.id)"));
  assert.ok(js.includes('draftExtraForEmployee(knownEmployee)'));
});


test('safety hub surfaces only editable server drafts with resume and discard actions',()=>{
  assert.ok(js.includes("canDraft=canEdit('accidents')||canEdit('complaints')||canEdit('near_misses')"));
  assert.ok(js.includes("canDraft?api('/drafts')"));
  assert.ok(js.includes('保存中の下書き'));
  assert.ok(js.includes('自分の下書きのみ'));
  assert.ok(js.includes('data-action="resume-draft"'));
  assert.ok(js.includes('data-action="discard-draft"'));
  assert.ok(js.includes('async function resumeSafetyDraft(kind)'));
  assert.ok(js.includes('async function discardSafetyDraft(kind)'));
  assert.ok(js.includes("window.confirm('この下書きを破棄しますか？')"));
});

test('home deadline metric labels the actual action window instead of saying 60 days',()=>{
  assert.ok(js.includes("metric('期限対応',deadlines?.summary?.total??'—','超過〜30日')"));
  assert.equal(js.includes("metric('期限対応',deadlines?.summary?.total??'—','60日以内')"),false);
});


test('taxi work patterns are clear company terms and legacy labels render compatibly',()=>{
  for(const label of ['日勤','夜勤','隔勤','H勤'])assert.ok(js.includes("['"+label+"','"+label+"']"),label);
  assert.ok(js.includes("'隔日勤務':'隔勤'"));
  assert.ok(js.includes("'午後から隔日勤務':'H勤'"));
  assert.ok(js.includes("'H勤務':'H勤'"));
  assert.ok(js.includes("detail('勤務区分',workPatternDisplay(e.work_pattern))"));
});

test('taxi placement guidance is helpful but does not prohibit exceptions',()=>{
  assert.ok(js.includes("訓練課は通常「日勤」です。"));
  assert.ok(js.includes("1課・2課は通常「隔勤」または「H勤」です。"));
  assert.ok(js.includes("3課は通常「日勤」または「夜勤」です。"));
  assert.ok(js.includes("例外としてこのまま登録しますか？"));
  assert.ok(js.includes('function confirmTaxiPlacement'));
});

test('basic fixed car is independent of work pattern and remains only an editable default for actual vehicle',()=>{
  assert.ok(js.includes("function isBasicFixedVehicle(vehicle,employee)"));
  assert.ok(js.includes("vehicle?.assignment_mode||'')==='dedicated'"));
  assert.equal(js.includes("isBasicFixedVehicle(vehicle,employee)&&workPattern"),false);
  assert.ok(js.includes("['dedicated','基本固定車']"));
  assert.ok(js.includes('日勤・夜勤・隔勤・H勤のどの勤務区分でも設定できます'));
  assert.ok(js.includes("formField('car_no','実際の乗車号車'"));
  assert.ok(js.includes('基本固定車が入っていても変更できます'));
  assert.ok(js.includes("function employeeSuggestedCar(employee,ops)"));
});

test('employee detail distinguishes basic fixed cars from other assigned cars',()=>{
  assert.ok(js.includes("isBasicFixedVehicle(v,employee)?'基本固定車':'その他担当車'"));
  assert.ok(js.includes('<h4>基本固定車・担当車</h4>'));
  assert.ok(js.includes('vehicleAssignmentLabel(v.assignment_mode)'));
});
