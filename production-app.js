(() => {
  'use strict';

  const state={me:null,view:'home',challenge:null,enrollment:null,loading:false,lastRequestId:'',dialog:null,credentialEmployeeId:null,credentialData:null,employeeSupport:null,employeeOperational:null,workImport:null,analysisFilters:{},userItems:[],pages:{},deadlineFilter:'action'};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate=v=>v?String(v).slice(0,10):'—';
  const fmtText=v=>v===null||v===undefined||v===''?'—':String(v);
  const roleLabel=r=>r==='full'?'全社管理者':r==='scoped'?'範囲指定利用者':r==='self'?'旧本人権限（本番不可）':'—';
  const VIEW_FEATURE={employees:'employees',deadlines:'deadlines',accidents:'accidents',complaints:'complaints',vehicles:'vehicles','near-misses':'near_misses',credentials:'credentials_documents','work-import':'work_import',analysis:'safety_analysis',users:'user_admin',audit:'audit_logs'};
  const NAV_FEATURES={
    home:[],employees:['employees'],
    work:['deadlines','credentials_documents','work_import'],
    safety:['accidents','complaints','near_misses','employees','handoffs'],
    analysis:['safety_analysis'],vehicles:['vehicles'],
    admin:['user_admin','audit_logs']
  };
  const NAV_PARENT={deadlines:'work',credentials:'work','work-import':'work',accidents:'safety',complaints:'safety','near-misses':'safety',users:'admin',audit:'admin'};
  function navParent(view){return NAV_PARENT[view]||view}
  function canViewAny(features){return !(features||[]).length||(features||[]).some(canView)}
  function featureLevel(feature){
    if(!feature)return null;
    if(state.me?.role_level==='full')return 'edit';
    const p=(state.me?.permissions||[]).find(x=>x.feature===feature);
    return p?.access_level||null
  }
  function canView(feature){return Boolean(featureLevel(feature))}
  function canEdit(feature){return featureLevel(feature)==='edit'}
  const FEATURE_OPTIONS=[
    ['employees','社員情報'],['deadlines','期限'],['accidents','事故'],['complaints','苦情'],['near_misses','ヒヤリ'],
    ['credentials_documents','資格・書類'],['vehicles','車両'],['safety_analysis','分析'],['work_import','勤務取込'],
    ['assets_training','貸与品・教育'],['handoffs','引継ぎ']
  ];
  const PERMISSION_PRESETS={
    viewer:FEATURE_OPTIONS.filter(([f])=>f!=='work_import').map(([feature])=>({feature,access_level:'view'})),
    manager:[
      {feature:'employees',access_level:'edit'},{feature:'deadlines',access_level:'view'},{feature:'accidents',access_level:'edit'},
      {feature:'complaints',access_level:'edit'},{feature:'near_misses',access_level:'edit'},{feature:'credentials_documents',access_level:'edit'},
      {feature:'vehicles',access_level:'view'},{feature:'safety_analysis',access_level:'view'},{feature:'handoffs',access_level:'edit'}
    ],
    safety:[
      {feature:'employees',access_level:'view'},{feature:'deadlines',access_level:'view'},{feature:'accidents',access_level:'edit'},
      {feature:'complaints',access_level:'edit'},{feature:'near_misses',access_level:'edit'},{feature:'credentials_documents',access_level:'view'},
      {feature:'vehicles',access_level:'view'},{feature:'safety_analysis',access_level:'view'},{feature:'handoffs',access_level:'edit'}
    ]
  };
  function permissionMap(list){return Object.fromEntries((list||[]).map(x=>[x.feature,x.access_level]))}
  function permissionFields(current=[]){
    const m=permissionMap(current);
    return FEATURE_OPTIONS.map(([feature,label])=>formSelect('perm_'+feature,label,[['','利用しない'],['view','閲覧'],['edit','閲覧・編集']],m[feature]||'')).join('')
  }
  function permissionsFromForm(fd,preset){
    if(preset&&preset!=='custom')return (PERMISSION_PRESETS[preset]||[]).map(x=>({...x}));
    return FEATURE_OPTIONS.map(([feature])=>({feature,access_level:fdText(fd,'perm_'+feature)})).filter(x=>['view','edit'].includes(x.access_level))
  }
  function permissionSummary(list){
    const counts={view:0,edit:0};for(const p of list||[])if(counts[p.access_level]!==undefined)counts[p.access_level]++;
    return '閲覧 '+counts.view+' / 編集 '+counts.edit
  }

  async function api(path,{method='GET',body,headers={}}={}){
    const ctrl=new AbortController();
    const timeout=setTimeout(()=>ctrl.abort(),15000);
    try{
      const res=await fetch('/api/v1'+path,{
        method,credentials:'same-origin',cache:'no-store',
        headers:{'Accept':'application/json',...(body?{'Content-Type':'application/json'}:{}),...headers},
        body:body?JSON.stringify(body):undefined,signal:ctrl.signal
      });
      const requestId=res.headers.get('x-request-id')||'';
      if(requestId)state.lastRequestId=requestId;
      let data={};try{data=await res.json()}catch(_){}
      if(!res.ok){
        const e=new Error(data?.error?.message||('HTTP '+res.status));
        e.status=res.status;e.code=data?.error?.code||'HTTP_ERROR';e.requestId=data?.error?.request_id||requestId;e.data=data;
        throw e
      }
      return {data,res}
    }catch(err){
      if(err.name==='AbortError'){const e=new Error('通信がタイムアウトしました。ネットワークを確認してください。');e.code='REQUEST_TIMEOUT';throw e}
      throw err
    }finally{clearTimeout(timeout)}
  }

  async function apiRaw(path,{body,headers={}}={}){
    const ctrl=new AbortController();
    const timeout=setTimeout(()=>ctrl.abort(),30000);
    try{
      const res=await fetch('/api/v1'+path,{
        method:'POST',credentials:'same-origin',cache:'no-store',
        headers:{'Accept':'application/json','Content-Type':'application/octet-stream',...headers},
        body,signal:ctrl.signal
      });
      const requestId=res.headers.get('x-request-id')||'';
      if(requestId)state.lastRequestId=requestId;
      let data={};try{data=await res.json()}catch(_){}
      if(!res.ok){
        const e=new Error(data?.error?.message||('HTTP '+res.status));
        e.status=res.status;e.code=data?.error?.code||'HTTP_ERROR';e.requestId=data?.error?.request_id||requestId;e.data=data;
        throw e
      }
      return {data,res}
    }catch(err){
      if(err.name==='AbortError'){const e=new Error('勤務取込の通信がタイムアウトしました。');e.code='REQUEST_TIMEOUT';throw e}
      throw err
    }finally{clearTimeout(timeout)}
  }

  function showError(err,where=''){
    const box=$('globalError');
    const rid=err?.requestId||state.lastRequestId;
    box.innerHTML='<b>'+esc(where?where+'：':'')+esc(err?.message||'処理に失敗しました')+'</b>'+
      (err?.code?'<span class="error-code">'+esc(err.code)+'</span>':'')+
      (rid?'<div class="mini">照会ID '+esc(rid)+'</div>':'');
    box.hidden=false;
    if(err?.status===401&&state.me){state.me=null;showLogin()}
  }
  function clearError(){const b=$('globalError');b.hidden=true;b.textContent=''}

  async function boot(){
    bind();
    try{
      const {data}=await api('/me');
      state.me=data.user;
      showApp();
      await loadView('home')
    }catch(err){
      if([401,503].includes(err.status)){showLogin();if(err.status===503)showError(err,'本番接続')}
      else showError(err,'初期表示')
    }
  }

  function bind(){
    $('loginForm').addEventListener('submit',login);
    $('mfaForm').addEventListener('submit',completeMfa);
    $('logoutBtn').addEventListener('click',logout);
    $('nav').addEventListener('click',e=>{
      const b=e.target.closest('[data-view]');if(!b)return;
      loadView(b.dataset.view,{resetPage:true})
    });
    $('searchForm').addEventListener('submit',e=>{e.preventDefault();loadView(state.view,{q:$('searchInput').value.trim(),resetPage:true})});
    $('refreshBtn').addEventListener('click',()=>loadView(state.view,{q:$('searchInput').value.trim()}));
    $('content').addEventListener('click',e=>{
      const action=e.target.closest('[data-action]');
      if(action){handleAction(action.dataset.action,action.dataset.id||'',action.dataset.q||'');return}
      const row=e.target.closest('[data-employee-id]');
      if(row)employeeDetail(row.dataset.employeeId)
    });
    $('content').addEventListener('keydown',e=>{if(e.target?.id==='homeGlobalSearch'&&e.key==='Enter'){e.preventDefault();runHomeSearch()}});
    $('dialogBody').addEventListener('click',e=>{
      const close=e.target.closest('[data-dialog-close]');
      if(close){$('detailDialog').close();return}
      const action=e.target.closest('[data-dialog-action]');
      if(action)handleDialogAction(action.dataset.dialogAction,action.dataset.id||'')
    })
  }

  function showLogin(){
    $('appShell').hidden=true;$('authShell').hidden=false;$('mfaPanel').hidden=true;$('loginPanel').hidden=false;
    $('sessionUser').textContent='';clearError()
  }

  function showApp(){
    $('authShell').hidden=true;$('appShell').hidden=false;
    $('sessionUser').innerHTML='<b>'+esc(state.me?.display_name||'利用者')+'</b><span>'+esc(roleLabel(state.me?.role_level))+'</span>';
    document.body.dataset.role=state.me?.role_level||'';
    for(const button of $('nav').querySelectorAll('[data-view]')){
      button.hidden=!canViewAny(NAV_FEATURES[button.dataset.view]||[])
    }
  }

  async function login(e){
    e.preventDefault();clearError();
    const submit=$('loginSubmit');submit.disabled=true;
    try{
      const body={login_id:$('loginId').value.trim(),employee_no:$('employeeNo').value.trim(),password:$('password').value};
      const {data}=await api('/auth/login',{method:'POST',body});
      $('password').value='';
      if(data.mfa_required){
        state.challenge=data.challenge_token;
        $('loginPanel').hidden=true;$('mfaPanel').hidden=false;
        if(data.mfa_enrollment_required){
          const start=(await api('/auth/mfa/enroll/start',{method:'POST',body:{challenge_token:state.challenge}})).data;
          state.enrollment=start;
          $('mfaEnroll').hidden=false;
          $('mfaEnroll').innerHTML='<b>MFA初回登録</b><p>認証アプリへ次の秘密鍵を登録し、6桁コードを入力してください。</p>'+
            '<div class="secret-box">'+esc(start.secret)+'</div><details><summary>otpauth URI</summary><code>'+esc(start.otpauth_uri)+'</code></details>'
        }else{
          state.enrollment=null;$('mfaEnroll').hidden=true
        }
        $('mfaCode').focus();
        return
      }
      await enterApp()
    }catch(err){showError(err,'ログイン')}finally{submit.disabled=false}
  }

  async function completeMfa(e){
    e.preventDefault();clearError();
    const code=$('mfaCode').value.trim(),button=$('mfaSubmit');button.disabled=true;
    try{
      const path=state.enrollment?'/auth/mfa/enroll/complete':'/auth/mfa/verify';
      await api(path,{method:'POST',body:{challenge_token:state.challenge,code}});
      state.challenge=null;state.enrollment=null;$('mfaCode').value='';
      await enterApp()
    }catch(err){showError(err,'追加認証')}finally{button.disabled=false}
  }

  async function enterApp(){
    const {data}=await api('/me');state.me=data.user;showApp();await loadView('home')
  }

  async function logout(){
    clearError();
    try{await api('/auth/logout',{method:'POST'})}catch(err){if(err.status!==401)showError(err,'ログアウト')}
    state.me=null;state.challenge=null;state.enrollment=null;showLogin()
  }

  function navActive(view){
    const parent=navParent(view);
    [...$('nav').querySelectorAll('[data-view]')].forEach(b=>b.classList.toggle('active',b.dataset.view===parent))
  }

  async function loadView(view,opts={}){
    if(state.loading)return;
    if(view==='business')view='safety';
    const previousView=state.view;
    if(opts.resetPage)state.pages[view]=1;
    if(opts.page)state.pages[view]=Math.max(1,Number(opts.page)||1);
    state.loading=true;state.view=view;navActive(view);clearError();
    $('viewTitle').textContent={home:'ホーム',employees:'社員',work:'期限・勤務',deadlines:'期限',accidents:'事故',complaints:'苦情',safety:'運行・安全',vehicles:'車両','near-misses':'ヒヤリ',credentials:'資格・書類','work-import':'勤務取込',analysis:'分析',admin:'管理',users:'利用者管理',audit:'監査ログ'}[view]||view;
    $('searchWrap').hidden=['home','work','safety','admin','work-import','analysis'].includes(view);
    if(!$('searchWrap').hidden){
      if(Object.prototype.hasOwnProperty.call(opts,'q'))$('searchInput').value=String(opts.q||'');
      else if(previousView!==view||opts.resetPage)$('searchInput').value=''
    }
    $('content').innerHTML='<div class="loading">読込中…</div>';
    try{
      if(view==='home')await renderHome();
      else if(view==='employees')await renderEmployees(opts.q||'');
      else if(view==='work')await renderWorkHub();
      else if(view==='safety')await renderSafetyHub();
      else if(view==='admin')await renderAdminHub();
      else if(view==='deadlines')await renderDeadlines(opts.q||'');
      else if(view==='accidents')await renderAccidents(opts.q||'');
      else if(view==='complaints')await renderComplaints(opts.q||'');
      else if(view==='vehicles')await renderVehicles(opts.q||'')
      else if(view==='near-misses')await renderNearMisses(opts.q||'')
      else if(view==='credentials')await renderCredentials(opts.q||'')
      else if(view==='work-import')await renderWorkImport()
      else if(view==='analysis')await renderSafetyAnalysis()
      else if(view==='users')await renderUsers(opts.q||'')
      else if(view==='audit')await renderAuditLogs(opts.q||'')
    }catch(err){$('content').innerHTML='';showError(err,'データ取得')}finally{state.loading=false}
  }

  async function renderHome(){
    const [deadlines,accidents,complaints,handoffs]=await Promise.all([
      canView('deadlines')?api('/deadlines?filter=action&page_size=8').then(x=>x.data).catch(()=>null):Promise.resolve(null),
      canView('accidents')?api('/accidents?page_size=5').then(x=>x.data).catch(()=>null):Promise.resolve(null),
      canView('complaints')?api('/complaints?page_size=5').then(x=>x.data).catch(()=>null):Promise.resolve(null),
      canView('handoffs')?api('/handoffs').then(x=>x.data).catch(()=>null):Promise.resolve(null)
    ]);
    const pending=(handoffs?.handoffs||[]).filter(x=>x.status==='pending'&&String(x.to_user_id)===String(state.me?.id));
    const quick=[];
    if(canView('employees'))quick.push(hubButton('employees','社員','社員台帳・資格・教育・貸与品'));
    if(canViewAny(NAV_FEATURES.work))quick.push(hubButton('work','期限・勤務','期限確認から勤務取込まで'));
    if(canViewAny(NAV_FEATURES.safety))quick.push(hubButton('safety','運行・安全','事故・苦情・ヒヤリ・引継ぎ'));
    if(canView('vehicles'))quick.push(hubButton('vehicles','車両','号車・担当・車検・整備'));
    if(canView('safety_analysis'))quick.push(hubButton('analysis','分析','傾向から実務画面へ戻る'));
    $('content').innerHTML=
      '<div class="hero"><div><span class="eyebrow">今日の業務</span><h2>'+esc(state.me?.display_name||'')+' さん</h2><p>探す → 開く → 処理する → 履歴・分析まで、ここを起点に進めます。</p></div>'+
      '<div class="role-card"><span>権限</span><b>'+esc(roleLabel(state.me?.role_level))+'</b></div></div>'+
      '<div class="metric-grid">'+
      metric('期限対応',deadlines?.summary?.total??'—','超過〜30日')+
      metric('期限超過',deadlines?.summary?.overdue??'—','最優先')+
      metric('事故',accidents?.total??'—','担当範囲')+
      metric('苦情',complaints?.total??'—','担当範囲')+
      '</div>'+
      '<section class="panel"><div class="list-head"><div><b>社員・号車・案件をまとめて検索</b><span>権限のある範囲だけ検索</span></div></div>'+
      '<div class="toolbar"><input id="homeGlobalSearch" placeholder="氏名 / 社員番号 / 号車 / 事故番号 / 苦情 / ヒヤリ" autocomplete="off"><button class="small-primary" data-action="home-search">検索</button></div>'+
      '<div id="homeGlobalResults" class="cards"><div class="empty">検索語を入力すると、社員・車両・安全案件を横断して探します。</div></div></section>'+
      (pending.length?'<section class="panel"><div class="list-head"><div><b>自分宛ての未確認引継ぎ</b><span>'+esc(pending.length)+'件</span></div></div><div class="cards">'+pending.slice(0,5).map(x=>
        '<div class="record"><div><b>'+esc(x.case_type)+' / '+esc(x.case_id)+'</b><p>'+esc(x.note||'担当変更')+'</p></div><div class="record-meta"><span>'+esc(fmtDate(x.created_at))+'</span>'+handoffCaseButton(x)+'<button class="record-action" data-action="ack-handoff" data-id="'+esc(x.id)+'">確認済みにする</button></div></div>'
      ).join('')+'</div></section>':'')+
      '<section class="panel"><div class="list-head"><div><b>よく使う入口</b><span>業務の流れで配置</span></div></div><div class="hub-grid">'+quick.join('')+'</div></section>'
  }

  async function runHomeSearch(){
    const input=$('homeGlobalSearch'),box=$('homeGlobalResults'),q=String(input?.value||'').trim();
    if(!box)return;
    if(!q){box.innerHTML='<div class="empty">検索語を入力してください。</div>';return}
    box.innerHTML='<div class="loading">検索中…</div>';
    const encoded=encodeURIComponent(q),jobs=[];
    const add=(kind,promise)=>jobs.push(promise.then(data=>({kind,data})).catch(()=>({kind,data:null})));
    if(canView('employees'))add('employees',api('/employees?page_size=6&q='+encoded).then(x=>x.data));
    if(canView('vehicles'))add('vehicles',api('/vehicles?page_size=6&q='+encoded).then(x=>x.data));
    if(canView('accidents'))add('accidents',api('/accidents?page_size=6&q='+encoded).then(x=>x.data));
    if(canView('complaints'))add('complaints',api('/complaints?page_size=6&q='+encoded).then(x=>x.data));
    if(canView('near_misses'))add('near',api('/near-misses?page_size=6&q='+encoded).then(x=>x.data));
    const groups=await Promise.all(jobs),rows=[];
    for(const g of groups){
      for(const x of g.data?.items||[]){
        if(g.kind==='employees')rows.push('<div class="record"><div><b>社員　'+esc(x.name)+'</b><span>社員番号 '+esc(x.employee_no)+' / '+esc(x.office||'—')+' / '+esc(x.department||'—')+'</span></div><div class="record-meta"><button class="record-action" data-action="open-employee" data-id="'+esc(x.id)+'">社員詳細</button></div></div>');
        else if(g.kind==='vehicles')rows.push('<div class="record"><div><b>車両　'+esc(x.car_no)+'号車</b><span>'+esc(x.model||x.service||'—')+' / '+esc(x.primary_employee_name||'主担当なし')+'</span></div><div class="record-meta"><button class="record-action" data-action="edit-vehicle" data-id="'+esc(x.id)+'">車両詳細</button></div></div>');
        else if(g.kind==='accidents')rows.push('<div class="record"><div><b>事故　'+esc(x.accident_no)+'</b><span>'+esc(x.employee_name||'')+' / '+esc(fmtDate(x.occurred_on))+'</span><p>'+esc(x.summary||'')+'</p></div><div class="record-meta"><button class="record-action" data-action="edit-accident" data-id="'+esc(x.id)+'">事故を開く</button></div></div>');
        else if(g.kind==='complaints')rows.push('<div class="record"><div><b>苦情　'+esc(x.complaint_no)+'</b><span>'+esc(x.employee_name||'')+' / '+esc(fmtDate(x.responded_on))+'</span><p>'+esc(x.summary||'')+'</p></div><div class="record-meta"><button class="record-action" data-action="edit-complaint" data-id="'+esc(x.id)+'">苦情を開く</button></div></div>');
        else if(g.kind==='near')rows.push('<div class="record"><div><b>ヒヤリ　'+esc(x.report_no)+'</b><span>'+esc(x.employee_name||'')+' / '+esc(fmtDate(x.reported_on))+'</span><p>'+esc(x.summary||'')+'</p></div><div class="record-meta"><button class="record-action" data-action="open-filtered-view" data-id="near-misses" data-q="'+esc(q)+'">一覧で確認</button></div></div>');
      }
    }
    box.innerHTML=rows.length?rows.join(''):'<div class="empty">該当する社員・号車・案件はありません。</div>'
  }
  function metric(label,value,note){return '<div class="metric"><span>'+esc(label)+'</span><b>'+esc(value)+'</b><small>'+esc(note)+'</small></div>'}
  function check(label,note){return '<div class="check"><b>✓ '+esc(label)+'</b><span>'+esc(note)+'</span></div>'}

  function listHeader(total,label,action=''){return '<div class="list-head"><div><b>'+esc(label)+'</b><span>'+esc(total)+'件</span></div>'+action+'</div>'}
  function empty(){return '<div class="empty">該当データはありません。</div>'}
  function deadlineTargetButton(x){
    const type=String(x.type||''),employeeId=String(x.employee_id||'');
    let allowed=false,label='開く';
    if(['vehicle_inspection','vehicle_maintenance'].includes(type)){allowed=canView('vehicles');label='号車'}
    else if(['qualification','document'].includes(type)){allowed=canView('credentials_documents');label=canEdit('credentials_documents')?'該当データを更新':'資格・書類'}
    else if(['training','asset'].includes(type)){allowed=canView('employees')&&canView('assets_training');label=canEdit('assets_training')?'該当データを更新':'社員詳細'}
    else {allowed=canView('employees');label='社員'}
    if(!allowed)return '';
    return '<button class="record-action" data-action="deadline-target" data-id="'+esc(x.source_id||'')+'" data-q="'+esc(type+'|'+employeeId)+'">'+esc(label)+'</button>'
  }
  async function openDeadlineTarget(sourceId,target){
    const [type,employeeId]=String(target||'').split('|');
    if(['vehicle_inspection','vehicle_maintenance'].includes(type))return editVehicle(sourceId);
    if(['qualification','document'].includes(type)){
      state.credentialEmployeeId=employeeId;
      await loadView('credentials');
      if(canEdit('credentials_documents')){
        if(type==='qualification')return editQualification(sourceId);
        return editDocumentMetadata(sourceId)
      }
      return
    }
    if(['training','asset'].includes(type)){
      await employeeDetail(employeeId);
      const employee=state.dialog?.record;
      if(!employee)return;
      if(canEdit('assets_training')){
        if(type==='training')return editTrainingForEmployee(employee,sourceId);
        return editAssetForEmployee(employee,sourceId)
      }
      return
    }
    return employeeDetail(employeeId)
  }
  function currentPage(view){return Math.max(1,Number(state.pages[view])||1)}
  function paginationHtml(data,view,q=''){
    const total=Number(data?.total||0),size=Math.max(1,Number(data?.page_size||50)),page=Math.max(1,Number(data?.page||currentPage(view))),pages=Math.max(1,Math.ceil(total/size));
    state.pages[view]=Math.min(page,pages);
    if(total<=size)return '';
    const start=(page-1)*size+1,end=Math.min(total,page*size);
    return '<div class="list-pager"><button class="ghost light" data-action="list-page" data-id="'+(page-1)+'" data-q="'+esc(q)+'" '+(page<=1?'disabled':'')+'>← 前へ</button>'+
      '<span>'+esc(start)+'〜'+esc(end)+'件 / '+esc(total)+'件　'+esc(page)+' / '+esc(pages)+'ページ</span>'+
      '<button class="ghost light" data-action="list-page" data-id="'+(page+1)+'" data-q="'+esc(q)+'" '+(page>=pages?'disabled':'')+'>次へ →</button></div>'
  }

  async function renderEmployees(q){
    const page=currentPage('employees');
    const sp=new URLSearchParams({page_size:'50',page:String(page)});if(q)sp.set('q',q);
    const {data}=await api('/employees?'+sp);
    const add=state.me?.role_level==='full'?'<button class="small-primary" data-action="new-employee">＋ 社員登録</button>':'';
    $('content').innerHTML=listHeader(data.total,'社員',add)+(data.items.length?'<div class="cards">'+data.items.map(e=>
      '<button class="record employee" data-employee-id="'+esc(e.id)+'"><div><b>'+esc(e.name)+'</b><span>社員番号 '+esc(e.employee_no)+'</span></div>'+
      '<div class="record-meta"><span>'+esc(e.office||'—')+'</span><span>'+esc(e.department||'—')+'</span><span>'+esc(e.lifecycle_status||'—')+'</span></div></button>'
    ).join('')+'</div>':empty())
    $('content').insertAdjacentHTML('beforeend',paginationHtml(data,'employees',q));
  }

  async function employeeDetail(id){
    clearError();
    try{
      const {data}=await api('/employees/'+encodeURIComponent(id));
      const e=data.employee,q=encodeURIComponent(e.employee_no||'');
      const [support,deadlines,vehicles,accidents,complaints,near]=await Promise.all([
        canView('assets_training')?Promise.all([
          api('/training?employee_id='+encodeURIComponent(id)+'&page_size=20').then(x=>x.data),
          api('/assets?employee_id='+encodeURIComponent(id)+'&page_size=20').then(x=>x.data)
        ]):Promise.resolve([null,null]),
        canView('deadlines')?api('/deadlines?filter=action&page_size=6&q='+q).then(x=>x.data).catch(()=>null):Promise.resolve(null),
        canView('vehicles')?api('/vehicles?page_size=6&q='+q).then(x=>x.data).catch(()=>null):Promise.resolve(null),
        canView('accidents')?api('/accidents?page_size=1&q='+q).then(x=>x.data).catch(()=>null):Promise.resolve(null),
        canView('complaints')?api('/complaints?page_size=1&q='+q).then(x=>x.data).catch(()=>null):Promise.resolve(null),
        canView('near_misses')?api('/near-misses?page_size=1&q='+q).then(x=>x.data).catch(()=>null):Promise.resolve(null)
      ]);
      const [training,assets]=support;
      state.employeeSupport={training:training?.items||[],assets:assets?.items||[]};
      state.employeeOperational={deadlines,vehicles,accidents,complaints,near};
      $('dialogTitle').textContent=e.name||'社員詳細';
      const employeeActions=[];
      if(canView('deadlines'))employeeActions.push('<button class="ghost light" data-dialog-action="open-employee-deadlines">期限</button>');
      if(canView('credentials_documents'))employeeActions.push('<button class="ghost light" data-dialog-action="open-employee-credentials">資格・書類</button>');
      if(canView('vehicles'))employeeActions.push('<button class="ghost light" data-dialog-action="open-employee-vehicles">担当号車</button>');
      if(canView('accidents'))employeeActions.push('<button class="ghost light" data-dialog-action="open-employee-accidents">事故履歴</button>');
      if(canView('complaints'))employeeActions.push('<button class="ghost light" data-dialog-action="open-employee-complaints">苦情履歴</button>');
      if(canView('near_misses'))employeeActions.push('<button class="ghost light" data-dialog-action="open-employee-near">ヒヤリ履歴</button>');
      if(canEdit('employees'))employeeActions.push('<button class="small-primary" data-dialog-action="edit-employee">社員情報を編集</button>');
      if(state.me?.role_level==='full')employeeActions.push('<button class="ghost light" data-dialog-action="transition-employee">異動・在籍状態</button>');
      if(state.me?.role_level==='full')employeeActions.push('<button class="ghost light" data-dialog-action="renumber-employee">社員番号変更</button>');
      if(state.me?.role_level==='full')employeeActions.push('<button class="small-primary" data-dialog-action="create-user-for-employee">利用者アカウント発行</button>');
      const edit=employeeActions.length?'<div class="dialog-actions">'+employeeActions.join('')+'</div>':'';
      state.dialog={type:'employee',record:e,etag:'"'+e.version+'"'};
      $('dialogBody').innerHTML='<div class="detail-grid">'+
        detail('社員番号',e.employee_no)+detail('在籍状態',e.lifecycle_status)+detail('事業所',e.office)+detail('部署',e.department)+
        detail('タクシー課区分',e.taxi_section)+detail('班',e.team)+detail('勤務区分',workPatternDisplay(e.work_pattern))+
        detail('雇用区分',e.employment_type)+detail('職位',e.position)+detail('乗務可否',e.safety_state)+detail('固定ID',e.id)+
        '</div>'+employeeHistoryHtml(data.history)+employeeOperationalHtml(e,state.employeeOperational)+employeeQuickCreateHtml(e,state.employeeOperational)+employeeSupportHtml(e,state.employeeSupport)+edit;
      $('detailDialog').showModal()
    }catch(err){showError(err,'社員詳細')}
  }

  function employeeHistoryHtml(history){
    const numbers=history?.number_changes||[],transitions=history?.transitions||[],workPatterns=history?.work_pattern_changes||[];
    if(!numbers.length&&!transitions.length&&!workPatterns.length)return '';
    const numberRows=numbers.length?numbers.map(x=>
      '<div class="support-row"><div><b>社員番号 '+esc(x.old_employee_no)+' → '+esc(x.new_employee_no)+'</b><span>'+esc(fmtDate(x.changed_at))+' / '+esc(x.reason||'理由記録なし')+'</span></div></div>'
    ).join(''):'<div class="empty compact-empty">社員番号変更履歴はありません。</div>';
    const transitionRows=transitions.length?transitions.map(x=>{
      const before=x.before_data||{},after=x.after_data||{};
      const from=[before.office,before.department,before.lifecycle_status].filter(Boolean).join(' / ')||'—';
      const to=[after.office,after.department,after.lifecycle_status].filter(Boolean).join(' / ')||'—';
      return '<div class="support-row"><div><b>'+esc(from)+' → '+esc(to)+'</b><span>'+esc(fmtDate(x.occurred_at))+' / '+esc(x.reason||'理由記録なし')+'</span></div></div>'
    }).join(''):'<div class="empty compact-empty">異動・在籍状態履歴はありません。</div>';
    const workRows=workPatterns.length?workPatterns.map(x=>{
      const before=workPatternDisplay(x.before_data?.work_pattern),after=workPatternDisplay(x.after_data?.work_pattern);
      return '<div class="support-row"><div><b>'+esc(before)+' → '+esc(after)+'</b><span>'+esc(fmtDate(x.occurred_at))+'</span></div></div>'
    }).join(''):'<div class="empty compact-empty">勤務区分変更履歴はありません。</div>';
    return '<section class="employee-support employee-history"><div class="support-head"><div><b>社員履歴</b><span>社員番号・所属/在籍・勤務区分の変更を確認</span></div></div>'+
      '<div class="support-grid"><div><h4>社員番号</h4>'+numberRows+'</div><div><h4>異動・在籍状態</h4>'+transitionRows+'</div><div><h4>勤務区分</h4>'+workRows+'</div></div></section>'
  }
  function employeeOperationalHtml(employee,ops){
    const deadlines=ops?.deadlines,vehicles=ops?.vehicles,accidents=ops?.accidents,complaints=ops?.complaints,near=ops?.near;
    const deadlineRows=deadlines?.items||[],vehicleRows=vehicles?.items||[];
    const metrics=[
      deadlines?'<button class="support-stat '+((deadlines.summary?.overdue||0)?'danger':'')+'" data-dialog-action="open-employee-deadlines"><small>要対応期限</small><b>'+esc(deadlines.total||0)+'</b><span>超過 '+esc(deadlines.summary?.overdue||0)+'</span></button>':'',
      vehicles?'<button class="support-stat" data-dialog-action="open-employee-vehicles"><small>担当号車</small><b>'+esc(vehicles.total||0)+'</b><span>車両へ</span></button>':'',
      accidents?'<button class="support-stat" data-dialog-action="open-employee-accidents"><small>事故</small><b>'+esc(accidents.total||0)+'</b><span>履歴へ</span></button>':'',
      complaints?'<button class="support-stat" data-dialog-action="open-employee-complaints"><small>苦情</small><b>'+esc(complaints.total||0)+'</b><span>履歴へ</span></button>':'',
      near?'<button class="support-stat" data-dialog-action="open-employee-near"><small>ヒヤリ</small><b>'+esc(near.total||0)+'</b><span>履歴へ</span></button>':''
    ].filter(Boolean).join('');
    const dueHtml=deadlineRows.length?deadlineRows.slice(0,4).map(x=>
      '<div class="support-row"><div><b>'+esc(x.label)+'</b><span>'+esc(fmtDate(x.due))+' / '+esc(x.action||'確認')+'</span></div><span class="due '+esc(x.due_state)+'">'+esc(x.days_remaining<0?'超過 '+Math.abs(x.days_remaining)+'日':x.days_remaining===0?'本日':x.days_remaining+'日後')+'</span></div>'
    ).join(''):'<div class="empty compact-empty">60日以内に要対応の期限はありません。</div>';
    const vehicleHtml=vehicleRows.length?vehicleRows.slice(0,4).map(v=>{
      const label=isBasicFixedVehicle(v,employee)?'基本固定車':'その他担当車';
      return '<div class="support-row"><div><b>'+esc(v.car_no)+'号車</b><span>'+esc(label)+' / '+esc(v.model||v.service||'—')+' / 車検 '+esc(fmtDate(v.inspection_due))+'</span></div><button class="record-action" data-dialog-action="open-employee-vehicle" data-id="'+esc(v.id)+'">車両</button></div>'
    }).join(''):'<div class="empty compact-empty">現在の担当号車はありません。</div>';
    if(!metrics&&!deadlineRows.length&&!vehicleRows.length)return '';
    return '<section class="employee-support employee-operational"><div class="support-head"><div><b>この社員の業務状況</b><span>期限・号車・安全履歴をここから追えます</span></div></div>'+
      (metrics?'<div class="support-stat-grid">'+metrics+'</div>':'')+
      '<div class="support-grid"><div><h4>近い期限</h4>'+dueHtml+'</div><div><h4>担当号車</h4>'+vehicleHtml+'</div></div></section>'
  }
  function employeeQuickCreateHtml(employee,ops){
    const buttons=[];
    if(canEdit('accidents'))buttons.push('<button class="ghost light" data-dialog-action="employee-new-accident">＋ 事故</button>');
    if(canEdit('complaints'))buttons.push('<button class="ghost light" data-dialog-action="employee-new-complaint">＋ 苦情</button>');
    if(canEdit('near_misses'))buttons.push('<button class="ghost light" data-dialog-action="employee-new-near">＋ ヒヤリ</button>');
    if(canEdit('employees'))buttons.push('<button class="ghost light" data-dialog-action="employee-new-guidance">＋ 安全指導</button>');
    if(!buttons.length)return '';
    const fixed=(ops?.vehicles?.items||[]).filter(v=>isBasicFixedVehicle(v,employee));
    const carNote=fixed.length===1?'基本固定車 '+fixed[0].car_no+'号車を初期表示（実際の乗車号車へ変更可）':fixed.length>1?'基本固定車が複数あるため号車は自動入力しません':'基本固定車なし。実際に乗った号車を入力してください';
    return '<section class="employee-support quick-create"><div class="support-head"><div><b>この社員で新規登録</b><span>社員を再検索せず、そのまま業務登録へ進めます。'+esc(carNote)+'</span></div><div>'+buttons.join('')+'</div></div></section>'
  }
  function employeeSuggestedCar(employee,ops){
    const fixed=(ops?.vehicles?.items||[]).filter(v=>isBasicFixedVehicle(v,employee));
    return fixed.length===1?String(fixed[0].car_no||''):''
  }
  function employeeSupportHtml(employee,support){
    if(!canView('assets_training'))return '';
    const training=support?.training||[],assets=support?.assets||[];
    const edit=canEdit('assets_training');
    const trainingRows=training.length?training.map(x=>
      '<div class="support-row"><div><b>'+esc(x.course)+'</b><span>期限 '+esc(fmtDate(x.due))+' / '+esc(x.status||'open')+'</span></div>'+
      (edit?'<button class="record-action" data-dialog-action="edit-training" data-id="'+esc(x.id)+'">更新</button>':'')+'</div>'
    ).join(''):'<div class="empty compact-empty">安全教育の登録はありません。</div>';
    const assetRows=assets.length?assets.map(x=>
      '<div class="support-row"><div><b>'+esc(x.item)+'</b><span>管理番号 '+esc(x.asset_no)+' / 返却予定 '+esc(fmtDate(x.return_due))+' / '+esc(x.status||'loaned')+'</span></div>'+
      (edit?'<button class="record-action" data-dialog-action="edit-asset" data-id="'+esc(x.id)+'">更新</button>':'')+'</div>'
    ).join(''):'<div class="empty compact-empty">貸与品の登録はありません。</div>';
    return '<section class="employee-support"><div class="support-head"><div><b>安全教育・貸与品</b><span>社員詳細にまとめて表示</span></div>'+
      (edit?'<div><button class="ghost light" data-dialog-action="new-training">＋ 安全教育</button><button class="ghost light" data-dialog-action="new-asset">＋ 貸与品</button></div>':'')+
      '</div><div class="support-grid"><div><h4>安全教育</h4>'+trainingRows+'</div><div><h4>貸与品</h4>'+assetRows+'</div></div></section>'
  }
  function detail(label,value){return '<div><span>'+esc(label)+'</span><b>'+esc(fmtText(value))+'</b></div>'}

  function hubButton(view,title,note,value=''){
    return '<button class="hub-card" data-action="open-view" data-id="'+esc(view)+'"><span>'+esc(title)+'</span><b>'+esc(value||'開く')+'</b><small>'+esc(note)+'</small></button>'
  }

  async function renderWorkHub(){
    if(!canViewAny(NAV_FEATURES.work)){$('content').innerHTML='<div class="empty">期限・勤務を利用できる権限がありません。</div>';return}
    let deadlines=null;
    if(canView('deadlines'))deadlines=await api('/deadlines?filter=action&page_size=6').then(x=>x.data);
    const shortcuts=[];
    if(canView('deadlines'))shortcuts.push(hubButton('deadlines','期限','免許・資格・健診など',deadlines?.summary?.overdue?('超過 '+deadlines.summary.overdue+'件'):'期限を確認'));
    if(canView('credentials_documents'))shortcuts.push(hubButton('credentials','資格・書類','社員ごとの資格と証憑を確認'));
    if(canView('work_import'))shortcuts.push(hubButton('work-import','勤務取込','Excelの事前確認・確定・ロールバック'));
    const rows=deadlines?.items||[];
    $('content').innerHTML=
      '<div class="hub-grid">'+shortcuts.join('')+'</div>'+
      (canView('deadlines')?'<section class="panel"><div class="list-head"><div><b>優先して確認する期限</b><span>'+esc(rows.length)+'件表示</span></div><button class="record-action" data-action="open-view" data-id="deadlines">期限一覧へ</button></div>'+
        (rows.length?'<div class="cards">'+rows.map(x=>'<div class="record"><div><b>'+esc(x.label)+'</b><span>'+esc(x.employee_name||x.employee_no||'車両・共通')+'</span></div><div class="record-meta"><span class="due '+esc(x.due_state)+'">'+esc(fmtDate(x.due))+'</span><span>'+esc(x.action)+'</span>'+deadlineTargetButton(x)+'</div></div>').join('')+'</div>':empty())+'</section>':'')
  }

  async function renderSafetyHub(){
    if(!canViewAny(NAV_FEATURES.safety)){$('content').innerHTML='<div class="empty">運行・安全を利用できる権限がありません。</div>';return}
    const canGuidance=canView('employees'),canDraft=canEdit('accidents')||canEdit('complaints')||canEdit('near_misses');
    const [accidents,complaints,near,handoffs,guidance,drafts]=await Promise.all([
      canView('accidents')?api('/accidents?page_size=1').then(x=>x.data):Promise.resolve(null),
      canView('complaints')?api('/complaints?page_size=1').then(x=>x.data):Promise.resolve(null),
      canView('near_misses')?api('/near-misses?page_size=1').then(x=>x.data):Promise.resolve(null),
      canView('handoffs')?api('/handoffs').then(x=>x.data):Promise.resolve(null),
      canGuidance?api('/guidance?page_size=8').then(x=>x.data):Promise.resolve(null),
      canDraft?api('/drafts').then(x=>x.data).catch(()=>null):Promise.resolve(null)
    ]);
    const handoffItems=(handoffs?.handoffs||[]).filter(x=>x.status==='pending'),guidanceItems=guidance?.items||[];
    const draftItems=(drafts?.drafts||[]).filter(x=>
      (x.kind==='accident'&&canEdit('accidents'))||
      (x.kind==='complaint'&&canEdit('complaints'))||
      (x.kind==='near_miss'&&canEdit('near_misses'))
    );
    const shortcuts=[];
    if(canView('accidents'))shortcuts.push(hubButton('accidents','事故','初報 → 対応 → 完了',String(accidents?.total??0)+'件'));
    if(canView('complaints'))shortcuts.push(hubButton('complaints','苦情','受付 → 指導 → 再発防止',String(complaints?.total??0)+'件'));
    if(canView('near_misses'))shortcuts.push(hubButton('near-misses','ヒヤリ','報告 → 月次確認 → 改善',String(near?.total??0)+'件'));
    if(canView('safety_analysis'))shortcuts.push(hubButton('analysis','安全分析','傾向を見て該当案件へ戻る'));
    const handoffHtml=handoffItems.length?'<div class="cards">'+handoffItems.slice(0,8).map(x=>
      '<div class="record"><div><b>'+esc(x.case_type)+' / '+esc(x.case_id)+'</b><p>'+esc(x.note||'担当変更')+'</p></div><div class="record-meta"><span>'+esc(fmtDate(x.created_at))+'</span>'+handoffCaseButton(x)+
      (canEdit('handoffs')&&String(x.to_user_id)===String(state.me?.id)?'<button class="record-action" data-action="ack-handoff" data-id="'+esc(x.id)+'">確認済みにする</button>':'')+'</div></div>'
    ).join('')+'</div>':empty();
    const guidanceHtml=guidanceItems.length?'<div class="cards">'+guidanceItems.map(x=>
      '<div class="record"><div><b>'+esc(x.type)+'</b><span>'+esc(x.employee_name||'')+' / '+esc(x.employee_no||'')+'</span><p>'+esc(x.summary||'')+'</p></div><div class="record-meta"><span>'+esc(fmtDate(x.guidance_on))+'</span><span>次回 '+esc(fmtDate(x.next_review))+'</span>'+
      (x.employee_id?'<button class="record-action" data-action="open-employee" data-id="'+esc(x.employee_id)+'">社員詳細</button>':'')+'</div></div>'
    ).join('')+'</div>':empty();
    const draftLabels={accident:'事故',complaint:'苦情',near_miss:'ヒヤリ'};
    const draftHtml=draftItems.length?'<div class="cards">'+draftItems.map(x=>
      '<div class="record"><div><b>'+esc(draftLabels[x.kind]||x.kind)+'の下書き</b><span>保存 '+esc(fmtDate(x.saved_at))+'</span></div>'+
      '<div class="record-meta"><button class="record-action" data-action="resume-draft" data-id="'+esc(x.kind)+'">再開</button><button class="warning" data-action="discard-draft" data-id="'+esc(x.kind)+'">破棄</button></div></div>'
    ).join('')+'</div>':'';

    $('content').innerHTML='<div class="hub-grid">'+shortcuts.join('')+'</div>'+
      (draftItems.length?'<section class="panel"><div class="list-head"><div><b>保存中の下書き</b><span>'+esc(draftItems.length)+'件 / 自分の下書きのみ</span></div></div>'+draftHtml+'</section>':'')+
      (canView('handoffs')?'<section class="panel"><div class="list-head"><div><b>引継ぎ未確認</b><span>'+esc(handoffItems.length)+'件</span></div></div>'+handoffHtml+'</section>':'')+
      (canGuidance?'<section class="panel"><div class="list-head"><div><b>安全指導・次回確認</b><span>'+esc(guidance?.total||0)+'件</span></div>'+(canEdit('employees')?'<button class="small-primary" data-action="new-guidance">＋ 指導登録</button>':'')+'</div>'+guidanceHtml+'</section>':'')
  }

  async function renderAdminHub(){
    if(state.me?.role_level!=='full'){$('content').innerHTML='<div class="empty">管理は全社管理者のみ利用できます。</div>';return}
    const shortcuts=[
      hubButton('users','利用者・権限','指定利用者の追加・停止・担当範囲設定'),
      hubButton('audit','監査ログ','誰が・いつ・何を操作したか確認')
    ];
    $('content').innerHTML='<div class="hub-grid">'+shortcuts.join('')+'</div>'+
      '<section class="panel"><h3>管理の原則</h3><div class="check-grid">'+
      check('指定利用者のみ','一般社員にはログインアカウントを配布しません')+
      check('最小権限','事業所・部署・機能・閲覧/編集を必要分だけ許可')+
      check('社内ネット限定','本番は社内LAN・社内Wi-Fiからのみ利用')+
      check('監査','権限変更・重要操作はサーバー側へ記録')+
      '</div></section>'
  }

  async function renderDeadlines(q){
    const page=currentPage('deadlines'),filter=state.deadlineFilter||'action';
    const sp=new URLSearchParams({filter,page_size:'50',page:String(page)});if(q)sp.set('q',q);
    const {data}=await api('/deadlines?'+sp);
    const filterLabels={action:'要対応（超過〜30日）',over:'期限超過',today:'本日',within30:'本日〜30日',60:'31〜60日',all60:'超過〜60日'};
    const filterButtons=[['action','要対応'],['over','超過'],['today','本日'],['within30','30日以内'],['60','31〜60日'],['all60','60日全体']].map(([v,l])=>
      '<button class="'+(filter===v?'small-primary':'ghost light')+'" data-action="deadline-filter" data-id="'+v+'">'+l+'</button>'
    ).join('');
    $('content').innerHTML=
      '<section class="panel compact-panel"><div class="list-head"><div><b>期限の表示条件</b><span>'+esc(filterLabels[filter]||filter)+'</span></div></div><div class="dialog-actions deadline-filters">'+filterButtons+'</div></section>'+
      '<div class="metric-grid compact">'+metric('表示件数',data.summary.total,filterLabels[filter]||filter)+metric('超過',data.summary.overdue,'現在の表示内')+metric('本日',data.summary.today,'現在の表示内')+metric('7日以内',data.summary.within7,'現在の表示内')+'</div>'+
      listHeader(data.total,'期限')+(data.items.length?'<div class="cards">'+data.items.map(x=>
        '<div class="record"><div><b>'+esc(x.label)+'</b><span>'+esc(x.employee_name||x.employee_no||'車両・共通')+'</span></div>'+
        '<div class="record-meta"><span class="due '+esc(x.due_state)+'">'+esc(fmtDate(x.due))+'</span><span>'+esc(x.action)+'</span>'+deadlineTargetButton(x)+'</div></div>'
      ).join('')+'</div>':empty())
    $('content').insertAdjacentHTML('beforeend',paginationHtml(data,'deadlines',q));
  }

  async function renderAccidents(q){
    const page=currentPage('accidents');
    const sp=new URLSearchParams({page_size:'50',page:String(page)});if(q)sp.set('q',q);
    const {data}=await api('/accidents?'+sp);
    const add=canEdit('accidents')?'<button class="small-primary" data-action="new-accident">＋ 事故登録</button>':'';
    $('content').innerHTML=listHeader(data.total,'事故',add)+(data.items.length?'<div class="cards">'+data.items.map(x=>
      '<div class="record"><div><b>'+esc(x.accident_no)+'</b><span>'+esc(x.employee_name)+' / '+esc(x.employee_no)+'</span><p>'+esc(x.summary)+'</p></div>'+
      '<div class="record-meta"><span>'+esc(fmtDate(x.occurred_on))+'</span><span>'+esc(x.phase)+'</span><span>'+esc(x.car_no||'号車未設定')+'</span>'+(x.employee_id?'<button class="record-action" data-action="open-employee" data-id="'+esc(x.employee_id)+'">社員</button>':'')+(x.car_no?'<button class="record-action" data-action="open-filtered-view" data-id="vehicles" data-q="'+esc(x.car_no)+'">号車</button>':'')+'<button class="record-action" data-action="edit-accident" data-id="'+esc(x.id)+'">開く</button></div></div>'
    ).join('')+'</div>':empty())
    $('content').insertAdjacentHTML('beforeend',paginationHtml(data,'accidents',q));
  }

  async function renderComplaints(q){
    const page=currentPage('complaints');
    const sp=new URLSearchParams({page_size:'50',page:String(page)});if(q)sp.set('q',q);
    const {data}=await api('/complaints?'+sp);
    const add=canEdit('complaints')?'<button class="small-primary" data-action="new-complaint">＋ 苦情登録</button>':'';
    $('content').innerHTML=listHeader(data.total,'苦情',add)+(data.items.length?'<div class="cards">'+data.items.map(x=>
      '<div class="record"><div><b>'+esc(x.complaint_no)+'</b><span>'+esc(x.employee_name)+' / '+esc(x.employee_no)+'</span><p>'+esc(x.summary)+'</p></div>'+
      '<div class="record-meta"><span>'+esc(fmtDate(x.responded_on))+'</span><span>'+esc(x.status)+'</span><span>'+esc(x.rank||'未判定')+'</span>'+(x.employee_id?'<button class="record-action" data-action="open-employee" data-id="'+esc(x.employee_id)+'">社員</button>':'')+(x.car_no?'<button class="record-action" data-action="open-filtered-view" data-id="vehicles" data-q="'+esc(x.car_no)+'">号車</button>':'')+'<button class="record-action" data-action="edit-complaint" data-id="'+esc(x.id)+'">開く</button></div></div>'
    ).join('')+'</div>':empty())
    $('content').insertAdjacentHTML('beforeend',paginationHtml(data,'complaints',q));
  }

  async function renderVehicles(q){
    const page=currentPage('vehicles');
    const sp=new URLSearchParams({page_size:'50',page:String(page)});if(q)sp.set('q',q);
    const {data}=await api('/vehicles?'+sp);
    const add=canEdit('vehicles')?'<button class="small-primary" data-action="new-vehicle">＋ 車両登録</button>':'';
    $('content').innerHTML=listHeader(data.total,'車両',add)+(data.items.length?'<div class="cards">'+data.items.map(v=>
      '<div class="record"><div><b>'+esc(v.car_no)+'号車</b><span>'+esc(v.model||v.service||'—')+'</span></div>'+
      '<div class="record-meta"><span>'+esc(v.status)+'</span><span>車検 '+esc(fmtDate(v.inspection_due))+'</span><span>'+esc(v.primary_employee_name||'主担当なし')+'</span>'+(v.primary_employee_id?'<button class="record-action" data-action="open-employee" data-id="'+esc(v.primary_employee_id)+'">担当社員</button>':'')+'<button class="record-action" data-action="edit-vehicle" data-id="'+esc(v.id)+'">開く</button></div></div>'
    ).join('')+'</div>':empty())
    $('content').insertAdjacentHTML('beforeend',paginationHtml(data,'vehicles',q));
  }


  async function renderNearMisses(q){
    const page=currentPage('near-misses');
    const sp=new URLSearchParams({page_size:'50',page:String(page)});if(q)sp.set('q',q);
    const {data}=await api('/near-misses?'+sp);
    const add=canEdit('near_misses')?'<button class="small-primary" data-action="new-near-miss">＋ ヒヤリ登録</button>':'';
    $('content').innerHTML=listHeader(data.total,'ヒヤリ',add)+(data.items.length?'<div class="cards">'+data.items.map(x=>
      '<div class="record"><div><b>'+esc(x.report_no)+'</b><span>'+esc(x.employee_name||'')+' / '+esc(x.employee_no||'')+'</span><p>'+esc(x.summary)+'</p></div>'+
      '<div class="record-meta"><span>'+esc(fmtDate(x.reported_on))+'</span><span>'+esc(x.risk_level||'未判定')+'</span><span>'+esc(x.car_no||'号車未設定')+'</span>'+(x.employee_id?'<button class="record-action" data-action="open-employee" data-id="'+esc(x.employee_id)+'">社員</button>':'')+(x.car_no?'<button class="record-action" data-action="open-filtered-view" data-id="vehicles" data-q="'+esc(x.car_no)+'">号車</button>':'')+(canEdit('handoffs')&&x.employee_id?'<button class="record-action" data-action="new-handoff-near" data-id="'+esc(x.report_no||x.id)+'" data-q="'+esc(x.employee_id)+'">引継ぎ</button>':'')+'</div></div>'
    ).join('')+'</div>':empty())
    $('content').insertAdjacentHTML('beforeend',paginationHtml(data,'near-misses',q));
  }

  async function renderCredentials(q){
    if(state.credentialEmployeeId)return renderCredentialEmployee(state.credentialEmployeeId);
    const page=currentPage('credentials');
    const sp=new URLSearchParams({page_size:'50',page:String(page)});if(q)sp.set('q',q);
    const {data}=await api('/employees?'+sp);
    $('content').innerHTML=listHeader(data.total,'資格・書類の対象社員')+(data.items.length?'<div class="cards">'+data.items.map(e=>
      '<div class="record"><div><b>'+esc(e.name)+'</b><span>社員番号 '+esc(e.employee_no)+'</span></div>'+
      '<div class="record-meta"><span>'+esc(e.office||'—')+'</span><span>'+esc(e.department||'—')+'</span><button class="record-action" data-action="show-credentials" data-id="'+esc(e.id)+'">資格・書類を見る</button></div></div>'
    ).join('')+'</div>':empty())
    $('content').insertAdjacentHTML('beforeend',paginationHtml(data,'credentials',q));
  }

  async function renderCredentialEmployee(employeeId){
    const {data}=await api('/employees/'+encodeURIComponent(employeeId)+'/credentials');
    state.credentialEmployeeId=employeeId;
    state.credentialData=data;
    const actions=canEdit('credentials_documents')?'<button class="small-primary" data-action="new-qualification">＋ 資格登録</button>':'';
    const back='<button class="ghost light" data-action="back-credentials">← 社員選択へ</button>';
    const qs=data.qualifications||[],docs=data.documents||[];
    $('content').innerHTML=
      '<div class="hero"><div><span class="eyebrow">資格・書類</span><h2>'+esc(data.employee.name)+'</h2><p>社員番号 '+esc(data.employee.employee_no)+'</p></div><div class="dialog-actions">'+back+actions+'</div></div>'+
      '<section class="panel"><div class="list-head"><div><b>資格</b><span>'+esc(qs.length)+'件</span></div></div>'+
      (qs.length?'<div class="cards">'+qs.map(q=>
        '<div class="record"><div><b>'+esc(q.name)+'</b><span>'+esc(q.certificate_no||'証明番号なし')+'</span></div>'+
        '<div class="record-meta"><span>'+esc(q.status||'active')+'</span><span>期限 '+esc(fmtDate(q.expiry))+'</span><span>証憑 '+esc(q.evidence_requirement||'unset')+'</span>'+
        (canEdit('credentials_documents')?'<button class="record-action" data-action="edit-qualification" data-id="'+esc(q.id)+'">更新</button>':'')+'</div></div>'
      ).join('')+'</div>':empty())+'</section>'+
      '<section class="panel"><div class="list-head"><div><b>書類</b><span>'+esc(docs.length)+'件</span></div></div>'+
      (docs.length?'<div class="cards">'+docs.map(d=>
        '<div class="record"><div><b>'+esc(d.name)+'</b><span>'+esc(d.category)+'</span></div>'+
        '<div class="record-meta"><span>'+esc(d.status)+'</span><span>期限 '+esc(fmtDate(d.expiry))+'</span><span>'+esc(d.original_handling)+'</span><span>'+esc(d.storage_state||'not_uploaded')+'</span>'+
        (d.storage_state==='active'&&d.malware_scan_status==='clean'?'<button class="record-action" data-action="download-original" data-id="'+esc(d.id)+'">原本を開く</button>':'')+
        (canEdit('credentials_documents')?'<button class="record-action" data-action="edit-document" data-id="'+esc(d.id)+'">情報更新</button>':'')+'</div></div>'
      ).join('')+'</div>':empty())+'</section>'
  }

  async function newGuidance(context={}){
    if(!canEdit('employees'))return;
    const knownEmployee=context.employee||null;
    const fields=
      (knownEmployee
        ?formField('employee_display','対象社員',(knownEmployee.employee_no||'')+' '+(knownEmployee.name||''),'text','readonly')
        :formField('employee_ref','対象社員（社員番号または氏名）','','text','required placeholder="例：1001 または 安芸太郎"'))+
      formField('guidance_on','指導日',new Date().toISOString().slice(0,10),'date','required')+
      formField('type','指導区分','','text','required')+
      formArea('summary','指導内容','','required')+
      formField('owner','担当者',state.me?.display_name||'','text','required')+
      formField('next_review','次回確認日','','date');
    openRecordForm(knownEmployee?'指導登録｜'+knownEmployee.name:'指導登録',fields,async fd=>{
      const employee=knownEmployee||await resolveEmployeeReference(fdText(fd,'employee_ref'));
      await api('/guidance',{method:'POST',body:{
        employee_id:employee.id,
        guidance_on:fdText(fd,'guidance_on'),
        type:fdText(fd,'type'),
        summary:fdText(fd,'summary'),
        owner:fdText(fd,'owner'),
        next_review:nullable(fdText(fd,'next_review'))
      }})
    })
  }

  async function resumeSafetyDraft(kind){
    if(kind==='accident'&&canEdit('accidents'))return newAccident();
    if(kind==='complaint'&&canEdit('complaints'))return newComplaint();
    if(kind==='near_miss'&&canEdit('near_misses'))return newNearMiss();
    const e=new Error('この下書きを再開する編集権限がありません');e.code='DRAFT_EDIT_PERMISSION_REQUIRED';throw e
  }
  async function discardSafetyDraft(kind){
    if(!window.confirm('この下書きを破棄しますか？'))return;
    await deleteSafetyDraft(kind);
    if(state.view==='safety')await renderSafetyHub()
  }

  function handoffCaseButton(x){
    const type=String(x.case_type||''),id=String(x.case_id||'');
    const view=type==='accident'?'accidents':type==='complaint'?'complaints':type==='near_miss'?'near-misses':'';
    return view&&id?'<button class="record-action" data-action="open-filtered-view" data-id="'+view+'" data-q="'+esc(id)+'">案件を開く</button>':''
  }

  async function createHandoffForm(context){
    if(!canEdit('handoffs'))return;
    const employeeId=String(context?.employeeId||'').trim();
    if(!employeeId){const e=new Error('引継ぎには対象社員が必要です');e.code='HANDOFF_EMPLOYEE_REQUIRED';throw e}
    const {data}=await api('/handoffs/targets?employee_id='+encodeURIComponent(employeeId));
    const targets=data.targets||[];
    if(!targets.length){const e=new Error('この社員を担当できる引継ぎ先管理者がいません');e.code='HANDOFF_TARGET_NOT_FOUND';throw e}
    const options=targets.map(t=>[t.id,(t.display_name||t.employee_name||'管理者')+' / '+roleLabel(t.role_level)]);
    const fields=formSelect('to_user_id','引継ぎ先',options,'','required')+
      formArea('note','引継ぎ内容','','required placeholder="相手が次に何を確認・対応するかを入力"');
    openRecordForm('引継ぎ｜'+String(context.label||context.caseId||''),fields,async fd=>{
      await api('/handoffs',{method:'POST',body:{
        case_type:String(context.caseType||''),
        case_id:String(context.caseId||''),
        employee_id:employeeId,
        to_user_id:fdText(fd,'to_user_id'),
        note:fdText(fd,'note')
      }})
    })
  }

  async function acknowledgeHandoff(id){
    await api('/handoffs/'+encodeURIComponent(id)+'/acknowledge',{method:'POST'});
    if(state.view==='home')await renderHome();else await renderSafetyHub()
  }

  async function renderUsers(q){
    if(state.me?.role_level!=='full'){
      $('content').innerHTML='<div class="empty">利用者管理は全社管理者のみ利用できます。</div>';return
    }
    const page=currentPage('users');
    const sp=new URLSearchParams({page_size:'50',page:String(page)});if(q)sp.set('q',q);
    const {data}=await api('/users?'+sp);
    state.userItems=data.items||[];
    $('content').innerHTML=listHeader(data.total,'利用者')+(state.userItems.length?'<div class="cards">'+state.userItems.map(u=>
      '<div class="record"><div><b>'+esc(u.display_name)+'</b><span>'+esc(u.login_id)+' / 社員番号 '+esc(u.employee_no)+'</span>'+
      '<p>'+esc(u.employee_name||'')+' / '+esc(roleLabel(u.role_level))+' / '+esc(u.state)+' / '+esc(permissionSummary(u.permissions))+'</p></div>'+
      '<div class="record-meta"><span>MFA '+esc(u.mfa_enrolled_at?'登録済':'未登録')+'</span><span>セッション '+esc(u.active_sessions||0)+'</span>'+
      '<button class="record-action" data-action="edit-user" data-id="'+esc(u.id)+'">権限</button>'+
      (u.state==='active'
        ?'<button class="warning" data-action="suspend-user" data-id="'+esc(u.id)+'">停止</button>'
        :'<button class="success" data-action="reactivate-user" data-id="'+esc(u.id)+'">再開</button>')+
      '</div></div>'
    ).join('')+'</div>':empty())
    $('content').insertAdjacentHTML('beforeend',paginationHtml(data,'users',q));
  }

  function userScopesText(scopes){
    return (scopes||[]).map(s=>String(s.office||'')+' | '+String(s.department||'')).join('\n')
  }

  function parseUserScopes(text){
    return String(text||'').split(/\r?\n/).map(x=>x.trim()).filter(Boolean).map(line=>{
      const parts=line.split('|').map(x=>x.trim());
      if(parts.length!==2||!parts[0]||!parts[1]){const e=new Error('担当範囲は「事業所 | 部署」を1行ずつ入力してください');e.code='INVALID_SCOPE_FORMAT';throw e}
      return {office:parts[0],department:parts[1]}
    })
  }

  async function editUserAccess(id){
    const u=state.userItems.find(x=>String(x.id)===String(id));
    if(!u)return;
    const fields=
      formSelect('role_level','利用者区分',[['scoped','範囲指定利用者'],['full','全社管理者']],u.role_level,'required')+
      formSelect('permission_preset','権限プリセット',[['custom','現在設定を個別調整'],['viewer','閲覧中心'],['manager','管理担当'],['safety','安全管理']],'custom')+
      formSelect('safety_authority','安全判断権限',[['false','なし'],['true','あり']],String(Boolean(u.safety_authority)))+
      formArea('scopes','担当範囲（範囲指定利用者）',userScopesText(u.scopes),'placeholder="本社 | タクシー1課&#10;府中 | タクシー2課"')+
      permissionFields(u.permissions);
    openRecordForm('利用者権限 '+u.display_name,fields,async fd=>{
      const role=fdText(fd,'role_level');
      const scopes=role==='scoped'?parseUserScopes(fdText(fd,'scopes')):[];
      const permissions=role==='scoped'?permissionsFromForm(fd,fdText(fd,'permission_preset')):[];
      await api('/users/'+encodeURIComponent(u.id)+'/access',{
        method:'PATCH',
        body:{role_level:role,safety_authority:fdText(fd,'safety_authority')==='true',scopes,permissions},
        headers:{'If-Match':'"'+u.version+'"'}
      })
    })
  }

  async function changeUserState(id,target){
    const u=state.userItems.find(x=>String(x.id)===String(id));
    if(!u)return;
    const label=target==='suspended'?'停止':'再開';
    const reason=window.prompt('利用者を'+label+'する理由を入力してください');
    if(!reason||!reason.trim())return;
    const path=target==='suspended'?'suspend':'reactivate';
    await api('/users/'+encodeURIComponent(u.id)+'/'+path,{
      method:'POST',
      body:{reason:reason.trim()},
      headers:{'If-Match':'"'+u.version+'"'}
    });
    await renderUsers($('searchInput').value.trim())
  }

  async function renderAuditLogs(q){
    if(state.me?.role_level!=='full'){$('content').innerHTML='<div class="empty">監査ログは全社管理者のみ利用できます。</div>';return}
    const page=currentPage('audit');
    const sp=new URLSearchParams({page_size:'50',page:String(page)});if(q)sp.set('q',q);
    const {data}=await api('/audit-logs?'+sp);
    $('content').innerHTML=
      '<section class="panel"><div class="list-head"><div><b>監査ログ</b><span>'+esc(data.total)+'件</span></div></div><p class="sub">利用者・社員・安全案件などの重要操作を、照会IDと一緒に追跡できます。検索欄から操作名・概要・照会IDを探せます。</p>'+
      (data.items.length?'<div class="cards">'+data.items.map(x=>
        '<div class="record"><div><b>'+esc(x.action)+'</b><span>'+esc(x.actor_name||'システム')+' / '+esc(fmtDate(x.occurred_at))+'</span><p>'+esc(x.summary||'')+'</p></div><div class="record-meta"><span>'+esc(x.entity_type||'—')+'</span><span>'+esc(x.result||'—')+'</span><span>照会ID '+esc(x.request_id||'—')+'</span>'+
        (x.employee_id?'<button class="record-action" data-action="open-employee" data-id="'+esc(x.employee_id)+'">社員詳細</button>':'')+'</div></div>'
      ).join('')+'</div>':empty())+'</section>'
    $('content').insertAdjacentHTML('beforeend',paginationHtml(data,'audit',q));
  }

  async function renderSafetyAnalysis(){
    if(!canView('safety_analysis')){$('content').innerHTML='<div class="empty">分析の利用権限がありません。</div>';return}
    const sp=new URLSearchParams();
    for(const [k,v] of Object.entries(state.analysisFilters||{}))if(v)sp.set(k,v);
    const {data}=await api('/analysis/management-summary'+(sp.toString()?'?'+sp.toString():''));
    const a=data.analysis||{},s=a.safety||{},k=s.kpis||{},t=s.totals||{},trend=s.trend||[],safetyDepartments=s.departments||[];
    const workforce=a.workforce||null,deadlines=a.deadlines||null,credentials=a.credentials||null,support=a.support||null,vehicles=a.vehicles||null,work=a.work||null,signals=a.signals||null,departments=a.departments||[],access=a.access||{};
    const pct=v=>Number(v||0).toFixed(1)+'%';
    const taskMetrics=[];
    if(deadlines){taskMetrics.push(metric('期限超過社員',deadlines.employees_overdue||0,'免許・健診・適性'));taskMetrics.push(metric('60日以内期限',deadlines.employees_due_60||0,'対象社員数'))}
    if(credentials){taskMetrics.push(metric('資格期限超過',credentials.qualifications_overdue||0,'資格'));taskMetrics.push(metric('書類要確認',credentials.documents_attention||0,'確認・差替・保存状態'))}
    if(support){taskMetrics.push(metric('教育期限超過',support.training_overdue||0,'未完了'));taskMetrics.push(metric('貸与品返却超過',support.assets_overdue||0,'未返却'))}
    if(vehicles){taskMetrics.push(metric('車検超過',vehicles.inspection_overdue||0,'稼働・整備中'));taskMetrics.push(metric('整備予定超過',vehicles.maintenance_overdue||0,'稼働・整備中'))}
    if(work){taskMetrics.push(metric('残業60h以上',work.overtime_60_count||0,(work.month_start?String(work.month_start).slice(0,7):'最新月')))}
    const currentHeader='<section class="panel"><div class="list-head"><div><b>集計の見方</b><span>現在の業務と過去の安全を分けて表示</span></div></div>'+
      '<p class="sub">'+esc(a.notes?.workforce_basis||'')+'</p><p class="sub">'+esc(a.notes?.safety_basis||'')+'</p><p class="sub">'+esc(a.notes?.cross_basis||'')+'</p></section>';
    const workforceHtml=workforce?'<section class="panel"><div class="list-head"><div><b>現在の人員状況</b><span>現在所属ベース</span></div></div>'+
      '<div class="metric-grid">'+
        metric('在籍',workforce.active||0,'active')+
        metric('休職',workforce.leave_count||0,'leave')+
        metric('退職予定',workforce.retirement_planned||0,'要引継ぎ')+
        metric('直近12か月入社',workforce.hired_last_12m||0,'現在日基準')+
      '</div></section>':'';
    const taskHtml=taskMetrics.length?'<section class="panel"><div class="list-head"><div><b>今対応が必要なこと</b><span>権限のある項目のみ</span></div></div><div class="metric-grid">'+taskMetrics.join('')+'</div></section>':'';
    const signalHtml=signals?'<section class="panel"><div class="list-head"><div><b>横断して確認する人数</b><span>順位付けではなく業務確認用</span></div></div>'+
      '<div class="metric-grid">'+
        metric('新入社員 × 安全記録',signals.new_hire_with_safety||0,'直近12か月入社 × 選択期間')+
        (signals.safety_and_deadline_action===null||signals.safety_and_deadline_action===undefined?'':metric('安全記録 × 期限対応',signals.safety_and_deadline_action||0,'選択期間 × 現在60日以内'))+
        (signals.retirement_planned_with_assets===null||signals.retirement_planned_with_assets===undefined?'':metric('退職予定 × 貸与品',signals.retirement_planned_with_assets||0,'返却確認'))+
      '</div></section>':'';
    const currentDeptHtml=departments.length?'<section class="panel"><div class="list-head"><div><b>現在所属別の人員・対応状況</b><span>'+esc(departments.length)+'区分</span></div></div>'+
      '<div class="table-wrap"><table><thead><tr><th>事業所</th><th>部署</th><th>在籍</th><th>休職</th><th>退職予定</th>'+(access.deadlines?'<th>期限要対応</th>':'')+'</tr></thead><tbody>'+
      departments.map(x=>'<tr><td>'+esc(x.office||'—')+'</td><td>'+esc(x.department||'—')+'</td><td>'+esc(x.active||0)+'</td><td>'+esc(x.leave_count||0)+'</td><td>'+esc(x.retirement_planned||0)+'</td>'+(access.deadlines?'<td>'+esc(x.deadline_action_employees||0)+'</td>':'')+'</tr>').join('')+
      '</tbody></table></div></section>':'';
    const next=[];
    if(access.employees)next.push(hubButton('employees','社員を確認','対象社員・教育・貸与品へ'));
    if(access.deadlines)next.push(hubButton('deadlines','期限を確認','超過・60日以内へ'));
    if(access.credentials)next.push(hubButton('credentials','資格・書類を確認','資格期限・原本状態へ'));
    if(access.vehicles)next.push(hubButton('vehicles','車両を確認','車検・整備・担当乗務員へ'));
    if(access.work_import)next.push(hubButton('work-import','勤務を確認','最新取込・残業集計へ'));
    if(canViewAny(NAV_FEATURES.safety))next.push(hubButton('safety','運行・安全を確認','事故・苦情・ヒヤリへ'));
    $('content').innerHTML=
      '<section class="panel"><div class="list-head"><div><b>分析条件</b><span>安全は記録時所属、人員系は現在所属</span></div></div>'+
      '<div class="filter-grid">'+
        '<label>開始日<input id="analysisFrom" type="date" value="'+esc(a.filters?.from||'')+'"></label>'+
        '<label>終了日<input id="analysisTo" type="date" value="'+esc(a.filters?.to||'')+'"></label>'+
        '<label>事業所<input id="analysisOffice" value="'+esc(a.filters?.office||'')+'" placeholder="全事業所"></label>'+
        '<label>部署<input id="analysisDepartment" value="'+esc(a.filters?.department||'')+'" placeholder="全部署"></label>'+
      '</div><div class="dialog-actions"><button class="ghost light" data-action="analysis-clear">条件解除</button><button class="small-primary" data-action="analysis-apply">この条件で集計</button></div></section>'+
      currentHeader+workforceHtml+taskHtml+signalHtml+currentDeptHtml+
      '<section class="panel"><div class="list-head"><div><b>安全分析</b><span>記録時所属snapshot</span></div></div>'+
      '<div class="metric-grid">'+
        metric('事故',t.accidents||0,'対象期間')+
        metric('ヒヤリ',t.near_misses||0,'対象期間')+
        metric('苦情',t.complaints||0,'対象期間')+
        metric('未完了比率',pct(k.open_case_ratio),'事故・苦情')+
      '</div><div class="metric-grid">'+
        metric('高リスクヒヤリ',pct(k.high_risk_near_miss_ratio),'ヒヤリ内')+
        metric('平均修理費',Number(k.average_repair_cost||0).toLocaleString()+'円','事故平均')+
        metric('分析項目充足',pct(k.analysis_completeness_ratio),'原因・再発防止等')+
        metric('snapshot充足',pct(k.snapshot_completeness_ratio),'記録時所属')+
      '</div></section>'+
      '<section class="panel"><div class="list-head"><div><b>安全記録 月別推移</b><span>'+esc(trend.length)+'か月</span></div></div>'+
      (trend.length?'<div class="table-wrap"><table><thead><tr><th>月</th><th>事故</th><th>ヒヤリ</th><th>苦情</th></tr></thead><tbody>'+
        trend.map(x=>'<tr><td>'+esc(x.month)+'</td><td>'+esc(x.accident)+'</td><td>'+esc(x.near_miss)+'</td><td>'+esc(x.complaint)+'</td></tr>').join('')+
        '</tbody></table></div>':empty())+'</section>'+
      '<section class="panel"><div class="list-head"><div><b>安全記録 部署別比較</b><span>'+esc(safetyDepartments.length)+'区分</span></div></div>'+
      '<p class="sub">'+esc(s.notes?.reference_per_100||'現在在籍人数を分母にした参考値です。')+'</p>'+
      (safetyDepartments.length?'<div class="table-wrap"><table><thead><tr><th>記録時事業所</th><th>記録時部署</th><th>事故</th><th>ヒヤリ</th><th>苦情</th><th>現在在籍</th><th>100人あたり参考</th></tr></thead><tbody>'+
        safetyDepartments.map(x=>'<tr><td>'+esc(x.office_snapshot||'—')+'</td><td>'+esc(x.department_snapshot||'—')+'</td><td>'+esc(x.accident_count)+'</td><td>'+esc(x.near_miss_count)+'</td><td>'+esc(x.complaint_count)+'</td><td>'+esc(x.active_employee_count)+'</td><td>'+esc(x.reference_per_100??'—')+'</td></tr>').join('')+
        '</tbody></table></div>':empty())+'</section>'+
      (next.length?'<section class="panel"><div class="list-head"><div><b>分析から次の処理へ</b><span>数字を見て終わらせない</span></div></div><div class="hub-grid">'+next.join('')+'</div></section>':'')
  }
  async function applyAnalysisFilters(){
    state.analysisFilters={
      from:$('analysisFrom')?.value||'',
      to:$('analysisTo')?.value||'',
      office:$('analysisOffice')?.value.trim()||'',
      department:$('analysisDepartment')?.value.trim()||''
    };
    await renderSafetyAnalysis()
  }

  async function renderWorkImport(){
    if(!canView('work_import')){$('content').innerHTML='<div class="empty">勤務取込の利用権限がありません。</div>';return}
    const current=state.workImport;
    const p=current?.preflight||null,batch=current?.batch||null,result=current?.result||null;
    const issueList=p?.blocking_issues?.length
      ?'<div class="issue-box"><b>取込を止める問題</b>'+p.blocking_issues.map(x=>'<div>'+esc(typeof x==='string'?x:JSON.stringify(x))+'</div>').join('')+'</div>'
      :'';
    const warningList=p?.warnings?.length
      ?'<div class="warning-box"><b>警告</b>'+p.warnings.map(x=>'<div>'+esc(typeof x==='string'?x:JSON.stringify(x))+'</div>').join('')+'</div>'
      :'';
    const preview=p?.preview?.length
      ?'<div class="table-wrap"><table><thead><tr><th>社員番号</th><th>対象月</th><th>拘束</th><th>残時間</th><th>残業</th><th>最終計上日</th></tr></thead><tbody>'+
        p.preview.map(x=>'<tr><td>'+esc(x.employee_no)+'</td><td>'+esc(x.month)+'</td><td>'+esc(x.restraint)+'</td><td>'+esc(x.remaining)+'</td><td>'+esc(x.overtime)+'</td><td>'+esc(x.last_posted)+'</td></tr>').join('')+
        '</tbody></table></div>'
      :'';
    const canCommit=Boolean(canEdit('work_import')&&p?.can_commit&&batch?.id&&batch?.state==='preflight');
    const canRollback=Boolean(canEdit('work_import')&&batch?.id&&batch?.state==='committed');
    const preflight=p?'<section class="panel"><div class="list-head"><div><b>前チェック結果</b><span>'+esc(p.row_count)+'行</span></div>'+
      (canCommit?'<button class="small-primary" data-action="work-import-commit">このbatchを確定</button>':'')+'</div>'+
      '<div class="metric-grid compact">'+
        metric('対象行',p.row_count,'最大5,000行')+
        metric('エラー',p.blocking_issue_count,'0件で取込可')+
        metric('警告',p.warning_count,'要確認')+
        metric('残業60h以上',p.overtime_60_count,'重点確認')+
      '</div><div class="mini">ファイル '+esc(p.file_name)+' / SHA-256 '+esc(p.sha256.slice(0,16))+'… / シート '+esc(p.sheet)+'</div>'+
      (batch?'<div class="mini">batch '+esc(batch.id)+' / 状態 '+esc(batch.state)+' / version '+esc(batch.version)+(batch.expires_at?' / 前チェック期限 '+esc(fmtText(batch.expires_at)):'')+'</div>':'')+
      issueList+warningList+preview+'</section>':'';
    const resultPanel=result?'<section class="panel"><div class="list-head"><div><b>直近の取込操作</b><span>'+esc(batch?.state||'')+'</span></div>'+
      (canRollback?'<button class="warning" data-action="work-import-rollback" data-id="'+esc(batch.id)+'">このbatchをロールバック</button>':'')+'</div>'+
      '<div class="metric-grid compact">'+
        metric('確定件数',result.committed_count??result.rolled_back_count??'—','batch単位')+
        metric('新規',result.inserted_count??'—','確定時')+
        metric('更新',result.updated_count??result.restored_count??'—','確定/復元')+
        metric('削除復元',result.removed_count??'—','ロールバック時')+
      '</div></section>':'';
    $('content').innerHTML=
      '<section class="panel"><h3>勤務集計Excel取込</h3><p class="sub">4MB以下・最大5,000行。前チェックでDBへ一時batchを作成し、内容確認後にversion付きで確定します。</p>'+
      '<div class="upload-row"><input id="workImportFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">'+
      '<button class="small-primary" data-action="work-import-preflight">前チェック</button></div>'+
      (current?.file?'<div class="mini">選択済み: '+esc(current.file.name)+' / '+esc(Math.round(current.file.size/1024))+'KB</div>':'')+
      '</section>'+preflight+resultPanel
  }

  async function workImportPreflight(){
    const input=$('workImportFile'),file=input?.files?.[0]||state.workImport?.file;
    if(!file){const e=new Error('Excelファイルを選択してください');e.code='WORK_FILE_REQUIRED';throw e}
    if(file.size>4*1024*1024){const e=new Error('勤務取込ファイルは4MB以下にしてください');e.code='WORK_FILE_TOO_LARGE';throw e}
    const {data}=await apiRaw('/work-import/preflight?file_name='+encodeURIComponent(file.name),{
      body:file,headers:{'X-File-Name':file.name}
    });
    state.workImport={file,preflight:data.preflight,batch:data.batch||null,result:null};
    await renderWorkImport()
  }

  async function workImportCommit(){
    const current=state.workImport;
    if(!current?.preflight?.can_commit||!current?.batch?.id||current.batch.state!=='preflight'){
      const e=new Error('前チェックbatchを作り直してください');e.code='WORK_PREFLIGHT_BATCH_REQUIRED';throw e
    }
    const {data}=await api('/work-import/batches/'+encodeURIComponent(current.batch.id)+'/commit',{
      method:'POST',headers:{'If-Match':'"'+current.batch.version+'"'}
    });
    state.workImport={...current,batch:data.batch,result:data};
    await renderWorkImport()
  }

  async function workImportRollback(id){
    const current=state.workImport;
    const batch=current?.batch;
    if(!batch?.id||String(batch.id)!==String(id)||batch.state!=='committed'){
      const e=new Error('ロールバック対象batchを再確認してください');e.code='WORK_ROLLBACK_BATCH_REQUIRED';throw e
    }
    const reason=window.prompt('ロールバック理由を入力してください');
    if(!reason||reason.trim().length<3)return;
    const {data}=await api('/work-import/batches/'+encodeURIComponent(batch.id)+'/rollback',{
      method:'POST',body:{reason:reason.trim()},headers:{'If-Match':'"'+batch.version+'"'}
    });
    state.workImport={...current,batch:data.batch,result:data};
    await renderWorkImport()
  }

  async function loadSafetyDraft(kind){
    try{return (await api('/drafts/'+encodeURIComponent(kind))).data.draft}
    catch(err){if(err.status===404)return null;throw err}
  }
  async function deleteSafetyDraft(kind){
    try{await api('/drafts/'+encodeURIComponent(kind),{method:'DELETE'})}
    catch(err){if(err.status!==404)throw err}
  }
  function draftPayloadForContext(draft,employee){
    const p=draft?.payload||{};
    if(!employee)return p;
    if(!p.employee_id||String(p.employee_id)!==String(employee.id))return {};
    return p
  }
  function draftExtraForEmployee(employee){
    return employee?{employee_id:employee.id,employee_no:employee.employee_no||'',employee_name:employee.name||''}:{}
  }

  function formField(name,label,value='',type='text',extra=''){
    return '<label>'+esc(label)+'<input name="'+esc(name)+'" type="'+esc(type)+'" value="'+esc(value??'')+'" '+extra+'></label>'
  }
  function formArea(name,label,value='',extra=''){
    return '<label class="wide">'+esc(label)+'<textarea name="'+esc(name)+'" '+extra+'>'+esc(value??'')+'</textarea></label>'
  }
  function formSelect(name,label,options,value='',extra=''){
    return '<label>'+esc(label)+'<select name="'+esc(name)+'" '+extra+'>'+options.map(([v,l])=>'<option value="'+esc(v)+'" '+(String(v)===String(value)?'selected':'')+'>'+esc(l)+'</option>').join('')+'</select></label>'
  }
  function formNote(text){
    return '<div class="form-note wide">'+esc(text)+'</div>'
  }
  function workPatternDisplay(value){
    const v=String(value||'');
    return {'隔日勤務':'隔勤','隔日':'隔勤','午後から隔日勤務':'H勤','H勤務':'H勤'}[v]||v||'未設定'
  }
  function workPatternOptions(current=''){
    const normalized=workPatternDisplay(current)==='未設定'?'':workPatternDisplay(current);
    const base=[['','未設定'],['日勤','日勤'],['夜勤','夜勤'],['隔勤','隔勤'],['H勤','H勤']];
    if(normalized&&!base.some(([v])=>v===normalized))base.push([normalized,normalized+'（既存値）']);
    return {options:base,value:normalized}
  }
  function vehicleAssignmentLabel(mode){
    return {dedicated:'基本固定車',shared:'共用車',spare:'予備車',loaner:'代車・貸出'}[String(mode||'')]||'未設定'
  }
  function isBasicFixedVehicle(vehicle,employee){
    return String(vehicle?.assignment_mode||'')==='dedicated'&&String(vehicle?.primary_employee_id||'')===String(employee?.id||'')
  }
  function formFile(name,label,accept,extra=''){
    return '<label class="wide">'+esc(label)+'<input name="'+esc(name)+'" type="file" accept="'+esc(accept)+'" '+extra+'></label>'
  }
  function openReadOnlyDialog(title,items,{actions=''}={}){
    $('dialogTitle').textContent=title;
    $('dialogBody').innerHTML='<div class="detail-grid">'+items.map(([label,value])=>detail(label,value)).join('')+
      '</div><div class="dialog-actions">'+actions+'<button type="button" class="ghost light" data-dialog-close>閉じる</button></div>';
    $('detailDialog').showModal()
  }

  function openRecordForm(title,fields,onSubmit,{actions='',draft=null}={}){
    $('dialogTitle').textContent=title;
    const draftButton=draft?'<button type="button" class="ghost light" data-draft-save>下書き保存</button>':'';
    $('dialogBody').innerHTML='<form id="recordForm" class="edit-form"><div class="edit-grid">'+fields+'</div><div class="dialog-actions">'+draftButton+actions+'<button type="button" class="ghost light" data-dialog-close>キャンセル</button><button class="small-primary" type="submit">保存</button></div></form>';
    const form=$('recordForm');
    let draftState=draft?.existing||null;
    const draftSave=form.querySelector('[data-draft-save]');
    if(draftSave)draftSave.onclick=async()=>{
      draftSave.disabled=true;clearError();
      try{
        const payload=Object.fromEntries([...new FormData(form).entries()].filter(([,v])=>typeof v==='string'));
        Object.assign(payload,draft?.extra||{});
        const headers=draftState?{'If-Match':'"'+draftState.version+'"'}:{};
        const {data}=await api('/drafts/'+encodeURIComponent(draft.kind),{method:'PUT',body:{payload},headers});
        draftState=data.draft;draftSave.textContent='下書き保存済み'
      }catch(err){showError(err,'下書き保存')}finally{draftSave.disabled=false}
    };
    form.onsubmit=async e=>{
      e.preventDefault();clearError();
      const submit=form.querySelector('[type="submit"]');submit.disabled=true;
      try{
        await onSubmit(new FormData(form));
        if(draft?.kind)try{await deleteSafetyDraft(draft.kind)}catch(_){}
        $('detailDialog').close();await loadView(state.view,{q:$('searchInput').value.trim()})
      }
      catch(err){showError(err,'保存')}finally{submit.disabled=false}
    };
    $('detailDialog').showModal()
  }
  function fdText(fd,name){return String(fd.get(name)||'').trim()}
  function nullable(v){const s=String(v||'').trim();return s||null}

  async function handleAction(action,id,q=''){
    try{
      if(action==='open-view')return loadView(id,{resetPage:true});
      if(action==='open-filtered-view')return loadView(id,{q,resetPage:true});
      if(action==='list-page')return loadView(state.view,{q,page:Number(id)||1});
      if(action==='deadline-target')return openDeadlineTarget(id,q);
      if(action==='deadline-filter'){state.deadlineFilter=id||'action';state.pages.deadlines=1;return renderDeadlines($('searchInput').value.trim())}
      if(action==='open-employee')return employeeDetail(id);
      if(action==='home-search')return runHomeSearch();
      if(action==='new-employee')return newEmployee();
      if(action==='new-accident')return newAccident();
      if(action==='edit-accident')return editAccident(id);
      if(action==='new-complaint')return newComplaint();
      if(action==='edit-complaint')return editComplaint(id);
      if(action==='new-vehicle')return newVehicle();
      if(action==='edit-vehicle')return editVehicle(id);
      if(action==='new-near-miss')return newNearMiss();
      if(action==='show-credentials'){state.credentialEmployeeId=id;return renderCredentialEmployee(id)}
      if(action==='back-credentials'){state.credentialEmployeeId=null;state.credentialData=null;return renderCredentials($('searchInput').value.trim())}
      if(action==='new-qualification')return newQualification();
      if(action==='edit-qualification')return editQualification(id);
      if(action==='edit-document')return editDocumentMetadata(id);
      if(action==='download-original')return downloadOriginal(id);
      if(action==='work-import-preflight')return workImportPreflight();
      if(action==='work-import-commit')return workImportCommit();
      if(action==='work-import-rollback')return workImportRollback(id);
      if(action==='analysis-apply')return applyAnalysisFilters();
      if(action==='analysis-clear'){state.analysisFilters={};return renderSafetyAnalysis()}
      if(action==='edit-user')return editUserAccess(id);
      if(action==='suspend-user')return changeUserState(id,'suspended');
      if(action==='reactivate-user')return changeUserState(id,'active');
      if(action==='new-guidance')return newGuidance();
      if(action==='resume-draft')return resumeSafetyDraft(id);
      if(action==='discard-draft')return discardSafetyDraft(id);
      if(action==='new-handoff-near')return createHandoffForm({caseType:'near_miss',caseId:id,employeeId:q,label:'ヒヤリ '+id});
      if(action==='ack-handoff')return acknowledgeHandoff(id)
    }catch(err){showError(err,'操作')}
  }
  async function handleDialogAction(action,id){
    const d=state.dialog;if(!d)return;
    try{
      if(action==='open-employee-deadlines'){$('detailDialog').close();return loadView('deadlines',{q:d.record.employee_no,resetPage:true})}
      if(action==='open-employee-credentials'){state.credentialEmployeeId=d.record.id;$('detailDialog').close();return loadView('credentials')}
      if(action==='open-employee-vehicles'){$('detailDialog').close();return loadView('vehicles',{q:d.record.employee_no,resetPage:true})}
      if(action==='open-employee-vehicle'){$('detailDialog').close();return editVehicle(id)}
      if(action==='open-employee-accidents'){$('detailDialog').close();return loadView('accidents',{q:d.record.employee_no,resetPage:true})}
      if(action==='open-employee-complaints'){$('detailDialog').close();return loadView('complaints',{q:d.record.employee_no,resetPage:true})}
      if(action==='open-employee-near'){$('detailDialog').close();return loadView('near-misses',{q:d.record.employee_no,resetPage:true})}
      if(action==='employee-new-accident')return newAccident({employee:d.record,carNo:employeeSuggestedCar(d.record,state.employeeOperational)});
      if(action==='employee-new-complaint')return newComplaint({employee:d.record});
      if(action==='employee-new-near')return newNearMiss({employee:d.record,carNo:employeeSuggestedCar(d.record,state.employeeOperational)});
      if(action==='employee-new-guidance')return newGuidance({employee:d.record});
      if(action==='edit-vehicle-assignments')return editVehicleAssignments(d.record);
      if(action==='vehicle-new-accident')return newAccident({employee:d.record.primary_employee_id?{id:d.record.primary_employee_id,employee_no:d.record.primary_employee_no,name:d.record.primary_employee_name}:null,carNo:d.record.car_no});
      if(action==='vehicle-new-near')return newNearMiss({employee:d.record.primary_employee_id?{id:d.record.primary_employee_id,employee_no:d.record.primary_employee_no,name:d.record.primary_employee_name}:null,carNo:d.record.car_no});
      if(action==='transition-employee')return transitionEmployeeForm(d.record);
      if(action==='renumber-employee')return changeEmployeeNumberForm(d.record);
      if(action==='edit-employee')return editEmployee(d.record);
      if(action==='create-user-for-employee')return createUserForEmployee(d.record);
      if(action==='new-training')return newTrainingForEmployee(d.record);
      if(action==='new-asset')return newAssetForEmployee(d.record);
      if(action==='edit-training')return editTrainingForEmployee(d.record,id);
      if(action==='edit-asset')return editAssetForEmployee(d.record,id);
      if(action==='handoff-accident')return createHandoffForm({caseType:'accident',caseId:d.record.accident_no||d.record.id,employeeId:d.record.employee_id,label:'事故 '+(d.record.accident_no||'')});
      if(action==='handoff-complaint')return createHandoffForm({caseType:'complaint',caseId:d.record.complaint_no||d.record.id,employeeId:d.record.employee_id,label:'苦情 '+(d.record.complaint_no||'')});
      if(action==='complete-accident')return terminalAction('accident','complete',d.record);
      if(action==='reopen-accident')return terminalAction('accident','reopen',d.record);
      if(action==='complete-complaint')return terminalAction('complaint','complete',d.record);
      if(action==='reopen-complaint')return terminalAction('complaint','reopen',d.record)
    }catch(err){showError(err,'操作')}
  }

  function supportRecord(kind,id){
    return (state.employeeSupport?.[kind]||[]).find(x=>String(x.id)===String(id))
  }
  function newTrainingForEmployee(employee){
    if(!canEdit('assets_training'))return;
    const fields=formField('course','教育・研修名','','text','required')+
      formField('due','期限','','date')+
      formSelect('status','状態',[['open','未完了'],['completed','完了']],'open');
    openRecordForm('安全教育を登録',fields,async fd=>{
      const status=fdText(fd,'status')||'open';
      await api('/training',{method:'POST',body:{
        employee_id:employee.id,course:fdText(fd,'course'),due:nullable(fdText(fd,'due')),status,
        completed_at:status==='completed'?new Date().toISOString():null
      }})
    })
  }
  function editTrainingForEmployee(employee,id){
    if(!canEdit('assets_training'))return;
    const rec=supportRecord('training',id);if(!rec)return;
    const fields=formField('course','教育・研修名',rec.course,'text','required')+
      formField('due','期限',fmtDate(rec.due)==='—'?'':fmtDate(rec.due),'date')+
      formSelect('status','状態',[['open','未完了'],['completed','完了']],rec.status||'open');
    openRecordForm('安全教育を更新',fields,async fd=>{
      const status=fdText(fd,'status')||'open';
      await api('/training/'+encodeURIComponent(rec.id),{method:'PATCH',body:{
        course:fdText(fd,'course'),due:nullable(fdText(fd,'due')),status,
        completed_at:status==='completed'?(rec.completed_at||new Date().toISOString()):null
      },headers:{'If-Match':'"'+rec.version+'"'}})
    })
  }
  function newAssetForEmployee(employee){
    if(!canEdit('assets_training'))return;
    const fields=formField('item','貸与品','','text','required')+
      formField('asset_no','管理番号','','text','required')+
      formField('return_due','返却予定','','date')+
      formSelect('status','状態',[['loaned','貸与中'],['returned','返却済']],'loaned');
    openRecordForm('貸与品を登録',fields,async fd=>{
      const status=fdText(fd,'status')||'loaned';
      await api('/assets',{method:'POST',body:{
        employee_id:employee.id,item:fdText(fd,'item'),asset_no:fdText(fd,'asset_no'),
        return_due:nullable(fdText(fd,'return_due')),status,
        returned_at:status==='returned'?new Date().toISOString():null
      }})
    })
  }
  function editAssetForEmployee(employee,id){
    if(!canEdit('assets_training'))return;
    const rec=supportRecord('assets',id);if(!rec)return;
    const fields=formField('item','貸与品',rec.item,'text','required')+
      formField('asset_no','管理番号',rec.asset_no,'text','required')+
      formField('return_due','返却予定',fmtDate(rec.return_due)==='—'?'':fmtDate(rec.return_due),'date')+
      formSelect('status','状態',[['loaned','貸与中'],['returned','返却済']],rec.status||'loaned');
    openRecordForm('貸与品を更新',fields,async fd=>{
      const status=fdText(fd,'status')||'loaned';
      await api('/assets/'+encodeURIComponent(rec.id),{method:'PATCH',body:{
        item:fdText(fd,'item'),asset_no:fdText(fd,'asset_no'),return_due:nullable(fdText(fd,'return_due')),status,
        returned_at:status==='returned'?(rec.returned_at||new Date().toISOString()):null
      },headers:{'If-Match':'"'+rec.version+'"'}})
    })
  }

  async function createUserForEmployee(employee){
    if(state.me?.role_level!=='full'||!employee?.id)return;
    const fields=
      formField('login_id','ログインID','','text','required maxlength="128"')+
      formField('display_name','表示名',employee.name||'','text','required')+
      formSelect('role_level','利用者区分',[['scoped','範囲指定利用者'],['full','全社管理者']],'scoped','required')+
      formSelect('permission_preset','権限プリセット',[['viewer','閲覧中心（推奨）'],['manager','管理担当'],['safety','安全管理'],['custom','カスタム']],'viewer')+
      formSelect('safety_authority','安全判断権限',[['false','なし'],['true','あり']],'false')+
      formArea('scopes','担当範囲（範囲指定利用者）','','placeholder="本社 | タクシー1課&#10;府中 | タクシー2課"')+
      permissionFields(PERMISSION_PRESETS.viewer);
    openRecordForm('利用者アカウント発行',fields,async fd=>{
      const role=fdText(fd,'role_level');
      const scopes=role==='scoped'?parseUserScopes(fdText(fd,'scopes')):[];
      const permissions=role==='scoped'?permissionsFromForm(fd,fdText(fd,'permission_preset')):[];
      const {data}=await api('/users',{method:'POST',body:{
        employee_id:employee.id,
        login_id:fdText(fd,'login_id'),
        display_name:fdText(fd,'display_name'),
        role_level:role,
        safety_authority:fdText(fd,'safety_authority')==='true',
        scopes,permissions
      }});
      window.prompt('初期設定トークンです。30分以内に本人へ安全な方法で渡してください。\nこの画面を閉じると再表示できません。',data.setup_token||'')
    })
  }

  async function newQualification(){
    if(!state.credentialEmployeeId||!canEdit('credentials_documents'))return;
    const fields=
      formField('name','資格名','','text','required')+
      formField('certificate_no','証明番号')+
      formField('expiry','有効期限','','date')+
      formSelect('evidence_requirement','証憑要否',[['unset','未設定'],['required','必要'],['not_required','不要']],'unset');
    openRecordForm('資格登録',fields,async fd=>{
      await api('/qualifications',{method:'POST',body:{
        employee_id:state.credentialEmployeeId,
        name:fdText(fd,'name'),
        certificate_no:nullable(fdText(fd,'certificate_no')),
        expiry:nullable(fdText(fd,'expiry')),
        evidence_requirement:fdText(fd,'evidence_requirement')||'unset'
      }})
    })
  }

  function editQualification(id){
    if(!canEdit('credentials_documents'))return;
    const q=(state.credentialData?.qualifications||[]).find(x=>String(x.id)===String(id));if(!q)return;
    const fields=
      formField('name','資格名',q.name,'text','required')+
      formField('certificate_no','証明番号',q.certificate_no)+
      formField('expiry','有効期限',fmtDate(q.expiry)==='—'?'':fmtDate(q.expiry),'date')+
      formSelect('status','状態',[['active','有効'],['expired','期限切れ'],['suspended','停止'],['inactive','無効']],q.status||'active')+
      formSelect('evidence_requirement','証憑要否',[['unset','未設定'],['required','必要'],['not_required','不要']],q.evidence_requirement||'unset');
    openRecordForm('資格を更新｜'+q.name,fields,async fd=>{
      await api('/qualifications/'+encodeURIComponent(q.id),{method:'PATCH',body:{
        name:fdText(fd,'name'),
        certificate_no:nullable(fdText(fd,'certificate_no')),
        expiry:nullable(fdText(fd,'expiry')),
        status:fdText(fd,'status')||'active',
        evidence_requirement:fdText(fd,'evidence_requirement')||'unset'
      },headers:{'If-Match':'"'+q.version+'"'}})
    })
  }

  function editDocumentMetadata(id){
    if(!canEdit('credentials_documents'))return;
    const d=(state.credentialData?.documents||[]).find(x=>String(x.id)===String(id));if(!d)return;
    const fields=
      formField('name','書類名',d.name,'text','required')+
      formField('kind','種別',d.kind)+
      formField('registered_on','登録日',fmtDate(d.registered_on)==='—'?'':fmtDate(d.registered_on),'date','required')+
      formField('expiry','有効期限',fmtDate(d.expiry)==='—'?'':fmtDate(d.expiry),'date')+
      formSelect('status','状態',[['pending','確認待ち'],['verified','確認済み'],['replacement_due','差替必要'],['replaced','差替済み'],['invalid','無効']],d.status||'pending')+
      formField('paper_location','紙原本保管場所',d.paper_location)+
      formField('retention_until','保存期限',fmtDate(d.retention_until)==='—'?'':fmtDate(d.retention_until),'date')+
      formArea('retention_review_note','保存確認メモ',d.retention_review_note||'');
    openRecordForm('書類情報を更新｜'+d.name,fields,async fd=>{
      await api('/documents/'+encodeURIComponent(d.id),{method:'PATCH',body:{
        name:fdText(fd,'name'),kind:nullable(fdText(fd,'kind')),registered_on:fdText(fd,'registered_on'),
        expiry:nullable(fdText(fd,'expiry')),status:fdText(fd,'status')||'pending',
        paper_location:nullable(fdText(fd,'paper_location')),retention_until:nullable(fdText(fd,'retention_until')),
        retention_review_note:nullable(fdText(fd,'retention_review_note'))
      },headers:{'If-Match':'"'+d.version+'"'}})
    })
  }

  async function newDocumentMetadata(){
    const e=new Error('書類の新規登録は原本ポリシーAPI統合後に本番画面へ開放します');
    e.code='DOCUMENT_POLICY_UI_NOT_ENABLED';
    throw e
  }

  async function downloadOriginal(id){
    const popup=window.open('about:blank','_blank','noopener,noreferrer');
    try{
      const {data}=await api('/documents/'+encodeURIComponent(id)+'/download-ticket');
      if(popup)popup.location.href=data.download.url;
      else window.open(data.download.url,'_blank','noopener,noreferrer')
    }catch(err){
      if(popup)popup.close();
      throw err
    }
  }

  async function sha256File(file){
    const bytes=await file.arrayBuffer();
    const digest=await crypto.subtle.digest('SHA-256',bytes);
    return [...new Uint8Array(digest)].map(b=>b.toString(16).padStart(2,'0')).join('')
  }

  async function newOriginalDocument(){
    const e=new Error('電子原本の新規登録はprivate原本ストレージ本番接続後に開放します');
    e.code='ORIGINAL_STORAGE_UI_NOT_ENABLED';
    throw e
  }

  async function newEmployee(){
    if(state.me?.role_level!=='full')return;
    const fields=
      formField('employee_no','社員番号','','text','required maxlength="64"')+
      formField('name','氏名','','text','required')+
      formField('furigana','フリガナ')+
      formField('office','事業所','','text','required')+
      formField('department','部署','','text','required')+
      formField('position','職位')+
      formField('employment_type','雇用区分')+
      formSelect('work_pattern','勤務区分',[['','未設定'],['日勤','日勤'],['夜勤','夜勤'],['隔勤','隔勤'],['H勤','H勤']],'')+
      formNote('タクシー乗務員の基本：入社時は訓練課で日勤。その後、隔勤・H勤は1課/2課、日勤・夜勤は3課が基本です。例外はそのまま登録できます。')+
      formField('hired_on','入社日','','date');
    openRecordForm('社員登録',fields,async fd=>{
      await api('/employees',{method:'POST',body:{
        employee_no:fdText(fd,'employee_no'),name:fdText(fd,'name'),furigana:nullable(fdText(fd,'furigana')),
        office:fdText(fd,'office'),department:fdText(fd,'department'),position:nullable(fdText(fd,'position')),
        employment_type:nullable(fdText(fd,'employment_type')),work_pattern:nullable(fdText(fd,'work_pattern')),hired_on:nullable(fdText(fd,'hired_on'))
      }})
    })
  }

  function editEmployee(e){
    const work=workPatternOptions(e.work_pattern);
    const fields=
      formField('name','氏名',e.name,'text','required')+formField('furigana','フリガナ',e.furigana)+
      formField('position','職位',e.position)+formField('taxi_section','タクシー課区分',e.taxi_section)+
      formField('team','班',e.team)+formField('employment_type','雇用区分',e.employment_type)+
      formSelect('work_pattern','勤務区分',work.options,work.value)+
      formNote('勤務区分と基本固定車は別管理です。日勤でも基本固定車を持てます。事故・修理・代車時は実際に乗った号車を事故・ヒヤリ側で記録します。')+
      formField('main_license','主免許',e.main_license)+
      formField('license_expiry','免許期限',fmtDate(e.license_expiry)==='—'?'':fmtDate(e.license_expiry),'date')+
      formField('health_check_due','健康診断期限',fmtDate(e.health_check_due)==='—'?'':fmtDate(e.health_check_due),'date')+
      formField('aptitude_due','適性診断期限',fmtDate(e.aptitude_due)==='—'?'':fmtDate(e.aptitude_due),'date');
    openRecordForm('社員情報を編集',fields,async fd=>{
      const body={};for(const k of ['name','furigana','position','taxi_section','team','employment_type','work_pattern','main_license','license_expiry','health_check_due','aptitude_due'])body[k]=nullable(fdText(fd,k));
      await api('/employees/'+encodeURIComponent(e.id),{method:'PATCH',body,headers:{'If-Match':'"'+e.version+'"'}})
    })
  }

  function transitionEmployeeForm(employee){
    if(state.me?.role_level!=='full')return;
    const fields=
      formField('office','事業所',employee.office,'text','required')+
      formField('department','部署',employee.department,'text','required')+
      formSelect('lifecycle_status','在籍状態',[['active','在籍'],['leave','休職'],['retirement_planned','退職予定'],['retired','退職']],employee.lifecycle_status||'active','required')+
      formField('retired_on','退職日',fmtDate(employee.retired_on)==='—'?'':fmtDate(employee.retired_on),'date')+
      formArea('reason','変更理由','','required placeholder="異動・休職・退職等の理由を入力"')+
      formArea('handoff_note','引継ぎメモ','','placeholder="必要な引継ぎ事項"');
    openRecordForm('異動・在籍状態｜'+employee.name,fields,async fd=>{
      await api('/employees/'+encodeURIComponent(employee.id)+'/transition',{
        method:'POST',
        body:{
          target:{
            office:fdText(fd,'office'),
            department:fdText(fd,'department'),
            lifecycle_status:fdText(fd,'lifecycle_status'),
            retired_on:nullable(fdText(fd,'retired_on'))
          },
          reason:fdText(fd,'reason'),
          handoff_note:nullable(fdText(fd,'handoff_note'))
        },
        headers:{'If-Match':'"'+employee.version+'"'}
      })
    })
  }

  function changeEmployeeNumberForm(employee){
    if(state.me?.role_level!=='full')return;
    const fields=
      formField('current_employee_no','現在の社員番号',employee.employee_no,'text','readonly')+
      formField('new_employee_no','新しい社員番号','','text','required maxlength="64"')+
      formArea('reason','変更理由','','required placeholder="社員番号変更の理由を入力"');
    openRecordForm('社員番号変更｜'+employee.name,fields,async fd=>{
      await api('/employees/'+encodeURIComponent(employee.id)+'/employee-number',{
        method:'POST',
        body:{new_employee_no:fdText(fd,'new_employee_no'),reason:fdText(fd,'reason')},
        headers:{'If-Match':'"'+employee.version+'"'}
      })
    })
  }

  async function newAccident(context={}){
    const knownEmployee=context.employee||null,draft=await loadSafetyDraft('accident'),p=draftPayloadForContext(draft,knownEmployee);
    const compatible=!knownEmployee||!draft||String(draft.payload?.employee_id||'')===String(knownEmployee.id);
    const employeeField=knownEmployee
      ?formField('employee_display','対象社員',(knownEmployee.employee_no||'')+' '+(knownEmployee.name||''),'text','readonly')
      :formField('employee_ref','対象社員（社員番号または氏名）',p.employee_no||p.employee_ref||'','text','required placeholder="例：1001 または 安芸太郎"');
    const fields=employeeField+
      formField('occurred_on','発生日',p.occurred_on||new Date().toISOString().slice(0,10),'date','required')+
      formField('car_no','実際の乗車号車',context.carNo||p.car_no||'')+formNote('基本固定車が入っていても変更できます。事故当日に実際に乗っていた号車を記録してください。')+formField('address','場所',p.address||'','text','required')+
      formArea('summary','事故内容',p.summary||'','required')+formArea('cause','原因',p.cause||'')+formArea('prevention','再発防止',p.prevention||'')+
      formArea('response_history','対応履歴',p.response_history||'')+formField('followup_due','フォロー期限',p.followup_due||'','date');
    const title=(knownEmployee?'事故登録｜'+knownEmployee.name:'事故登録')+(compatible&&draft?'｜下書き復元':'');
    openRecordForm(title,fields,async fd=>{
      const employee=knownEmployee||await resolveEmployeeReference(fdText(fd,'employee_ref'));
      await api('/accidents',{method:'POST',body:{
        employee_id:employee.id,occurred_on:fdText(fd,'occurred_on'),car_no:nullable(fdText(fd,'car_no')),
        address:fdText(fd,'address'),summary:fdText(fd,'summary'),cause:nullable(fdText(fd,'cause')),
        prevention:nullable(fdText(fd,'prevention')),response_history:nullable(fdText(fd,'response_history')),followup_due:nullable(fdText(fd,'followup_due'))
      }})
    },{draft:compatible?{kind:'accident',existing:draft,extra:draftExtraForEmployee(knownEmployee)}:null})
  }

  async function editAccident(id){
    const {data}=await api('/accidents/'+encodeURIComponent(id));const a=data.accident;state.dialog={type:'accident',record:a};
    if(!canEdit('accidents')){
      const quick=canEdit('handoffs')?'<button type="button" class="ghost light" data-dialog-action="handoff-accident">引継ぎ</button>':'';
      return openReadOnlyDialog('事故 '+(a.accident_no||''),[
        ['発生日',fmtDate(a.occurred_on)],['状態',a.phase],['号車',a.car_no],['場所',a.address],
        ['事故内容',a.summary],['原因',a.cause],['再発防止',a.prevention],['対応履歴',a.response_history],
        ['次回対応',a.next_action],['フォロー期限',fmtDate(a.followup_due)]
      ],{actions:quick})
    }
    const terminal=a.phase==='completed';
    const fields=formField('occurred_on','発生日',fmtDate(a.occurred_on),'date','required')+formField('car_no','号車',a.car_no)+
      formField('address','場所',a.address,'text','required')+formArea('summary','事故内容',a.summary,'required')+
      formArea('cause','原因',a.cause)+formArea('prevention','再発防止',a.prevention)+formArea('response_history','対応履歴',a.response_history)+
      formArea('next_action','次回対応',a.next_action)+formField('followup_due','フォロー期限',fmtDate(a.followup_due)==='—'?'':fmtDate(a.followup_due),'date');
    const actions=(canEdit('handoffs')?'<button type="button" class="ghost light" data-dialog-action="handoff-accident">引継ぎ</button>':'')+
      (terminal?'<button type="button" class="warning" data-dialog-action="reopen-accident">理由を入力して再開</button>':'<button type="button" class="success" data-dialog-action="complete-accident">完了</button>');
    if(terminal){
      $('dialogTitle').textContent='事故 '+(a.accident_no||'');
      $('dialogBody').innerHTML='<div class="detail-grid">'+detail('対象',a.employee_id)+detail('発生日',fmtDate(a.occurred_on))+detail('状態',a.phase)+detail('号車',a.car_no)+'</div><div class="dialog-actions">'+actions+'</div>';
      return $('detailDialog').showModal()
    }
    openRecordForm('事故 '+(a.accident_no||''),fields,async fd=>{
      const body={};for(const k of ['occurred_on','car_no','address','summary','cause','prevention','response_history','next_action','followup_due'])body[k]=nullable(fdText(fd,k));
      await api('/accidents/'+encodeURIComponent(a.id),{method:'PATCH',body,headers:{'If-Match':'"'+a.version+'"'}})
    },{actions})
  }

  async function newComplaint(context={}){
    const knownEmployee=context.employee||null,draft=await loadSafetyDraft('complaint'),p=draftPayloadForContext(draft,knownEmployee);
    const compatible=!knownEmployee||!draft||String(draft.payload?.employee_id||'')===String(knownEmployee.id);
    const employeeField=knownEmployee
      ?formField('employee_display','対象社員',(knownEmployee.employee_no||'')+' '+(knownEmployee.name||''),'text','readonly')
      :formField('employee_ref','対象社員（社員番号または氏名）',p.employee_no||p.employee_ref||'','text','required placeholder="例：1001 または 安芸太郎"');
    const fields=employeeField+
      formField('responded_on','対応日',p.responded_on||new Date().toISOString().slice(0,10),'date','required')+
      formArea('summary','苦情内容',p.summary||'','required')+
      formSelect('rank','ランク',[['unrated','未判定'],['A','A'],['B','B'],['C','C']],p.rank||'unrated')+
      formArea('guidance_content','指導内容',p.guidance_content||'')+formArea('next_action','次回対応',p.next_action||'')+formField('followup_due','フォロー期限',p.followup_due||'','date');
    const title=(knownEmployee?'苦情登録｜'+knownEmployee.name:'苦情登録')+(compatible&&draft?'｜下書き復元':'');
    openRecordForm(title,fields,async fd=>{
      const employee=knownEmployee||await resolveEmployeeReference(fdText(fd,'employee_ref'));
      await api('/complaints',{method:'POST',body:{
        employee_id:employee.id,responded_on:fdText(fd,'responded_on'),summary:fdText(fd,'summary'),
        rank:fdText(fd,'rank'),guidance_content:nullable(fdText(fd,'guidance_content')),
        next_action:nullable(fdText(fd,'next_action')),followup_due:nullable(fdText(fd,'followup_due'))
      }})
    },{draft:compatible?{kind:'complaint',existing:draft,extra:draftExtraForEmployee(knownEmployee)}:null})
  }

  async function editComplaint(id){
    const {data}=await api('/complaints/'+encodeURIComponent(id));const a=data.complaint;state.dialog={type:'complaint',record:a};
    if(!canEdit('complaints')){
      const quick=canEdit('handoffs')?'<button type="button" class="ghost light" data-dialog-action="handoff-complaint">引継ぎ</button>':'';
      return openReadOnlyDialog('苦情 '+(a.complaint_no||''),[
        ['対応日',fmtDate(a.responded_on)],['状態',a.status],['ランク',a.rank],['苦情内容',a.summary],
        ['指導内容',a.guidance_content],['次回対応',a.next_action],['フォロー期限',fmtDate(a.followup_due)],['完了',fmtDate(a.completed_at)]
      ],{actions:quick})
    }
    const terminal=a.status==='completed';
    const fields=formField('responded_on','対応日',fmtDate(a.responded_on),'date','required')+
      formArea('summary','苦情内容',a.summary,'required')+
      formSelect('rank','ランク',[['unrated','未判定'],['A','A'],['B','B'],['C','C']],a.rank||'unrated')+
      formArea('guidance_content','指導内容',a.guidance_content)+formArea('next_action','次回対応',a.next_action)+
      formField('followup_due','フォロー期限',fmtDate(a.followup_due)==='—'?'':fmtDate(a.followup_due),'date');
    const actions=(canEdit('handoffs')?'<button type="button" class="ghost light" data-dialog-action="handoff-complaint">引継ぎ</button>':'')+
      (terminal?'<button type="button" class="warning" data-dialog-action="reopen-complaint">理由を入力して再開</button>':'<button type="button" class="success" data-dialog-action="complete-complaint">完了</button>');
    if(terminal){
      $('dialogTitle').textContent='苦情 '+(a.complaint_no||'');
      $('dialogBody').innerHTML='<div class="detail-grid">'+detail('対応日',fmtDate(a.responded_on))+detail('状態',a.status)+detail('ランク',a.rank)+detail('完了',fmtDate(a.completed_at))+'</div><div class="dialog-actions">'+actions+'</div>';
      return $('detailDialog').showModal()
    }
    openRecordForm('苦情 '+(a.complaint_no||''),fields,async fd=>{
      const body={};for(const k of ['responded_on','summary','rank','guidance_content','next_action','followup_due'])body[k]=nullable(fdText(fd,k));
      await api('/complaints/'+encodeURIComponent(a.id),{method:'PATCH',body,headers:{'If-Match':'"'+a.version+'"'}})
    },{actions})
  }

  async function terminalAction(type,operation,record){
    let body={};
    if(operation==='reopen'){
      const reason=window.prompt('再開理由を入力してください');
      if(!reason||!reason.trim())return;
      body.reason=reason.trim()
    }
    const plural=type==='accident'?'accidents':'complaints';
    const {data}=await api('/'+plural+'/'+encodeURIComponent(record.id)+'/'+operation,{method:'POST',body,headers:{'If-Match':'"'+record.version+'"'}});
    $('detailDialog').close();
    state.dialog=null;
    await loadView(state.view,{q:$('searchInput').value.trim()});
    return data
  }

  async function newNearMiss(context={}){
    const manager=canEdit('near_misses'),knownEmployee=context.employee||null,draft=await loadSafetyDraft('near_miss'),p=draftPayloadForContext(draft,knownEmployee);
    const compatible=!knownEmployee||!draft||String(draft.payload?.employee_id||'')===String(knownEmployee.id);
    let fields='';
    if(manager){
      fields+=knownEmployee
        ?formField('employee_display','対象社員',(knownEmployee.employee_no||'')+' '+(knownEmployee.name||''),'text','readonly')
        :formField('employee_ref','対象社員（社員番号または氏名）',p.employee_no||p.employee_ref||'','text','required placeholder="例：1001 または 安芸太郎"')
    }
    fields+=formField('occurred_on','発生日',p.occurred_on||new Date().toISOString().slice(0,10),'date','required')+
      formField('occurred_time','発生時刻',p.occurred_time||'','time')+
      formField('reported_on','報告日',p.reported_on||new Date().toISOString().slice(0,10),'date','required')+
      formField('car_no','実際の乗車号車',context.carNo||p.car_no||'')+
      formNote('基本固定車が入っていても変更できます。発生時に実際に乗っていた号車を記録してください。')+
      formSelect('risk_level','リスク',[['','未判定'],['low','低'],['medium','中'],['high','高']],p.risk_level||'')+
      formArea('summary','内容',p.summary||'','required')+
      formArea('prevention','再発防止',p.prevention||'')+
      formArea('education','指導・教育',p.education||'');
    const title='ヒヤリ登録'+(compatible&&draft?'｜下書き復元':'');
    openRecordForm(title,fields,async fd=>{
      const body={
        occurred_on:fdText(fd,'occurred_on'),
        occurred_time:nullable(fdText(fd,'occurred_time')),
        reported_on:fdText(fd,'reported_on'),
        car_no:nullable(fdText(fd,'car_no')),
        risk_level:nullable(fdText(fd,'risk_level')),
        summary:fdText(fd,'summary'),
        prevention:nullable(fdText(fd,'prevention')),
        education:nullable(fdText(fd,'education'))
      };
      if(manager){
        const employee=knownEmployee||await resolveEmployeeReference(fdText(fd,'employee_ref'));
        body.employee_id=employee.id
      }
      await api('/near-misses',{method:'POST',body})
    },{draft:compatible?{kind:'near_miss',existing:draft,extra:draftExtraForEmployee(knownEmployee)}:null})
  }

  async function newVehicle(){
    const fields=formField('car_no','3桁号車','','text','required pattern="[0-9]{3}"')+
      formField('model','車種')+formField('service','用途')+
      formSelect('assignment_mode','車両の使い方',[['spare','予備車'],['shared','共用車'],['dedicated','基本固定車'],['loaner','代車・貸出']],'spare')+
      formField('primary_employee','主担当（社員番号または氏名）','','text','placeholder="基本固定車は必須。例：1001 または 安芸太郎"')+
      formNote('基本固定車は普段の基準車です。日勤・夜勤・隔勤・H勤のどの勤務区分でも設定できます。事故・修理・代車時の実乗車号車は事故・ヒヤリ登録側で変更します。')+
      formField('inspection_due','車検期限','','date','required')+formField('next_maintenance_due','次回整備','','date')+formArea('maintenance_note','整備メモ');
    openRecordForm('車両登録',fields,async fd=>{
      const mode=fdText(fd,'assignment_mode'),primaryRef=fdText(fd,'primary_employee');
      if(mode==='dedicated'&&!primaryRef){const err=new Error('基本固定車には主担当乗務員を入力してください');err.code='PRIMARY_EMPLOYEE_REQUIRED';throw err}
      const primary=primaryRef?await resolveEmployeeReference(primaryRef):null;
      await api('/vehicles',{method:'POST',body:{
        car_no:fdText(fd,'car_no'),model:nullable(fdText(fd,'model')),service:nullable(fdText(fd,'service')),
        assignment_mode:mode,primary_employee_id:primary?.id||null,
        inspection_due:fdText(fd,'inspection_due'),next_maintenance_due:nullable(fdText(fd,'next_maintenance_due')),
        maintenance_note:nullable(fdText(fd,'maintenance_note'))
      }})
    })
  }

  async function resolveEmployeeReference(reference){
    const value=String(reference||'').trim();
    if(!value)return null;
    const {data}=await api('/employees?page_size=20&q='+encodeURIComponent(value));
    const items=data.items||[];
    const exact=items.filter(e=>String(e.employee_no||'')===value||String(e.name||'')===value);
    if(exact.length===1)return exact[0];
    if(!exact.length&&items.length===1)return items[0];
    const err=new Error(exact.length>1?'同名社員が複数います。社員番号で入力してください':'社員が特定できません。「社員番号」または正確な氏名で入力してください');
    err.code='EMPLOYEE_REFERENCE_AMBIGUOUS';
    throw err
  }

  async function editVehicleAssignments(vehicle){
    const {data}=await api('/vehicles/'+encodeURIComponent(vehicle.id)),v=data.vehicle;
    const primary=(v.users||[]).find(x=>x.role==='primary');
    const additional=(v.users||[]).filter(x=>x.role==='additional');
    const fields=
      formSelect('assignment_mode','車両区分',[['spare','予備'],['shared','共用'],['dedicated','専属'],['loaner','貸出']],v.assignment_mode||'spare')+
      formField('primary_employee','主担当（社員番号または氏名）',primary?.employee_no||v.primary_employee_no||'','text','placeholder="例：1001 または 安芸太郎"')+
      formNote('「基本固定車」は普段の基準車で、絶対固定ではありません。事故・修理・代車時は別号車に乗れます。')+
      formArea('additional_employees','追加担当（1行1名・社員番号推奨）',additional.map(x=>x.employee_no||x.name).join('\n'),'placeholder="1002&#10;1015"');
    state.dialog={type:'vehicle',record:v};
    openRecordForm('車両 '+v.car_no+'号車｜担当乗務員',fields,async fd=>{
      const mode=fdText(fd,'assignment_mode');
      const primaryRef=fdText(fd,'primary_employee');
      if(mode==='dedicated'&&!primaryRef){const err=new Error('基本固定車には主担当乗務員を入力してください');err.code='PRIMARY_EMPLOYEE_REQUIRED';throw err}
      const primaryEmployee=primaryRef?await resolveEmployeeReference(primaryRef):null;
      const refs=String(fd.get('additional_employees')||'').split(/\r?\n|,/).map(x=>x.trim()).filter(Boolean);
      const resolved=await Promise.all(refs.map(resolveEmployeeReference));
      const additionalIds=[...new Set(resolved.map(e=>String(e.id)).filter(id=>!primaryEmployee||id!==String(primaryEmployee.id)))];
      await api('/vehicles/'+encodeURIComponent(v.id)+'/assignments',{
        method:'POST',
        body:{assignment_mode:mode,primary_employee_id:primaryEmployee?.id||null,additional_employee_ids:additionalIds},
        headers:{'If-Match':'"'+v.version+'"'}
      })
    })
  }

  async function editVehicle(id){
    const {data}=await api('/vehicles/'+encodeURIComponent(id));const v=data.vehicle;state.dialog={type:'vehicle',record:v};
    if(!canEdit('vehicles')){
      const quick=
        (canEdit('accidents')?'<button type="button" class="ghost light" data-dialog-action="vehicle-new-accident">＋ この号車で事故</button>':'')+
        (canEdit('near_misses')?'<button type="button" class="ghost light" data-dialog-action="vehicle-new-near">＋ この号車でヒヤリ</button>':'');
      return openReadOnlyDialog('車両 '+v.car_no+'号車',[
        ['車種',v.model],['用途',v.service],['状態',v.status],['車両の使い方',vehicleAssignmentLabel(v.assignment_mode)],
        ['主担当',v.primary_employee_name?((v.primary_employee_no||'')+' '+v.primary_employee_name):'未設定'],
        ['車検期限',fmtDate(v.inspection_due)],['次回整備',fmtDate(v.next_maintenance_due)],['整備メモ',v.maintenance_note]
      ],{actions:quick})
    }
    const fields=formField('model','車種',v.model)+formField('service','用途',v.service)+
      formSelect('status','状態',[['active','稼働'],['maintenance','整備'],['inactive','停止']],v.status||'active')+
      formField('inspection_due','車検期限',fmtDate(v.inspection_due)==='—'?'':fmtDate(v.inspection_due),'date','required')+
      formField('next_maintenance_due','次回整備',fmtDate(v.next_maintenance_due)==='—'?'':fmtDate(v.next_maintenance_due),'date')+
      formArea('maintenance_note','整備メモ',v.maintenance_note);
    const actions='<button type="button" class="ghost light" data-dialog-action="edit-vehicle-assignments">担当乗務員・基本車両を変更</button>'+
      (canEdit('accidents')?'<button type="button" class="ghost light" data-dialog-action="vehicle-new-accident">＋ この号車で事故</button>':'')+
      (canEdit('near_misses')?'<button type="button" class="ghost light" data-dialog-action="vehicle-new-near">＋ この号車でヒヤリ</button>':'');
    openRecordForm('車両 '+v.car_no+'号車',fields,async fd=>{
      const body={};for(const k of ['model','service','status','inspection_due','next_maintenance_due','maintenance_note'])body[k]=nullable(fdText(fd,k));
      await api('/vehicles/'+encodeURIComponent(v.id),{method:'PATCH',body,headers:{'If-Match':'"'+v.version+'"'}})
    },{actions})
  }

  window.addEventListener('DOMContentLoaded',boot);
})();