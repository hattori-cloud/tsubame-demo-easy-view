(() => {
  'use strict';

  const state={me:null,view:'home',challenge:null,enrollment:null,loading:false,lastRequestId:'',dialog:null,credentialEmployeeId:null,workImport:null,analysisFilters:{},userItems:[]};
  const $=id=>document.getElementById(id);
  const esc=v=>String(v??'').replace(/[&<>"']/g,c=>({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
  const fmtDate=v=>v?String(v).slice(0,10):'—';
  const fmtText=v=>v===null||v===undefined||v===''?'—':String(v);
  const roleLabel=r=>r==='full'?'全社管理者':r==='scoped'?'担当範囲管理者':r==='self'?'本人':'—';

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
      loadView(b.dataset.view)
    });
    $('searchForm').addEventListener('submit',e=>{e.preventDefault();loadView(state.view,{q:$('searchInput').value.trim()})});
    $('refreshBtn').addEventListener('click',()=>loadView(state.view,{q:$('searchInput').value.trim()}));
    $('content').addEventListener('click',e=>{
      const action=e.target.closest('[data-action]');
      if(action){handleAction(action.dataset.action,action.dataset.id||'');return}
      const row=e.target.closest('[data-employee-id]');
      if(row)employeeDetail(row.dataset.employeeId)
    });
    $('dialogBody').addEventListener('click',e=>{
      const close=e.target.closest('[data-dialog-close]');
      if(close){$('detailDialog').close();return}
      const action=e.target.closest('[data-dialog-action]');
      if(action)handleDialogAction(action.dataset.dialogAction)
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
    const manager=state.me?.role_level==='full'||state.me?.role_level==='scoped';
    for(const view of ['accidents','complaints','vehicles','analysis']){
      const button=$('nav').querySelector('[data-view="'+view+'"]');
      if(button)button.hidden=!manager
    }
    const workImport=$('nav').querySelector('[data-view="work-import"]');
    if(workImport)workImport.hidden=state.me?.role_level!=='full';
    const users=$('nav').querySelector('[data-view="users"]');
    if(users)users.hidden=state.me?.role_level!=='full'
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
    [...$('nav').querySelectorAll('[data-view]')].forEach(b=>b.classList.toggle('active',b.dataset.view===view))
  }

  async function loadView(view,opts={}){
    if(state.loading)return;
    state.loading=true;state.view=view;navActive(view);clearError();
    $('viewTitle').textContent={home:'ホーム',employees:'社員',deadlines:'期限センター',accidents:'事故',complaints:'苦情',vehicles:'車両','near-misses':'ヒヤリ',credentials:'資格・書類','work-import':'勤務取込',analysis:'安全分析',users:'利用者管理',business:'業務'}[view]||view;
    $('searchWrap').hidden=['home','work-import','analysis','business'].includes(view);
    $('content').innerHTML='<div class="loading">読込中…</div>';
    try{
      if(view==='home')await renderHome();
      else if(view==='employees')await renderEmployees(opts.q||'');
      else if(view==='deadlines')await renderDeadlines(opts.q||'');
      else if(view==='accidents')await renderAccidents(opts.q||'');
      else if(view==='complaints')await renderComplaints(opts.q||'');
      else if(view==='vehicles')await renderVehicles(opts.q||'')
      else if(view==='near-misses')await renderNearMisses(opts.q||'')
      else if(view==='credentials')await renderCredentials(opts.q||'')
      else if(view==='work-import')await renderWorkImport()
      else if(view==='analysis')await renderSafetyAnalysis()
      else if(view==='users')await renderUsers(opts.q||'')
      else if(view==='business')await renderBusiness()
    }catch(err){$('content').innerHTML='';showError(err,'データ取得')}finally{state.loading=false}
  }

  async function renderHome(){
    const requests=[
      api('/deadlines?filter=action&page_size=8').then(x=>x.data).catch(()=>null)
    ];
    if(state.me?.role_level!=='self'){
      requests.push(api('/accidents?page_size=5').then(x=>x.data).catch(()=>null));
      requests.push(api('/complaints?page_size=5').then(x=>x.data).catch(()=>null))
    }
    const [deadlines,accidents,complaints]=await Promise.all(requests);
    $('content').innerHTML=
      '<div class="hero"><div><span class="eyebrow">本番APIモード</span><h2>'+esc(state.me?.display_name||'')+' さん</h2><p>ブラウザ保存ではなく、サーバーの権限判定済みデータだけを表示しています。</p></div>'+
      '<div class="role-card"><span>権限</span><b>'+esc(roleLabel(state.me?.role_level))+'</b></div></div>'+
      '<div class="metric-grid">'+
      metric('期限対応',deadlines?.summary?.total??'—','60日以内')+
      metric('期限超過',deadlines?.summary?.overdue??'—','要確認')+
      metric('事故一覧',accidents?.total??(state.me?.role_level==='self'?'権限外':'—'),'担当範囲')+
      metric('苦情一覧',complaints?.total??(state.me?.role_level==='self'?'権限外':'—'),'担当範囲')+
      '</div>'+
      '<section class="panel"><h3>安全な本番接続</h3><div class="check-grid">'+
      check('Cookieセッション','HttpOnly / Secure / SameSite=Strict')+
      check('権限','API側で毎回再判定')+
      check('同時更新','version / If-Match')+
      check('監査','サーバー側audit log')+
      '</div></section>'
  }
  function metric(label,value,note){return '<div class="metric"><span>'+esc(label)+'</span><b>'+esc(value)+'</b><small>'+esc(note)+'</small></div>'}
  function check(label,note){return '<div class="check"><b>✓ '+esc(label)+'</b><span>'+esc(note)+'</span></div>'}

  function listHeader(total,label,action=''){return '<div class="list-head"><div><b>'+esc(label)+'</b><span>'+esc(total)+'件</span></div>'+action+'</div>'}
  function empty(){return '<div class="empty">該当データはありません。</div>'}

  async function renderEmployees(q){
    const sp=new URLSearchParams({page_size:'50'});if(q)sp.set('q',q);
    const {data}=await api('/employees?'+sp);
    const add=state.me?.role_level==='full'?'<button class="small-primary" data-action="new-employee">＋ 社員登録</button>':'';
    $('content').innerHTML=listHeader(data.total,'社員',add)+(data.items.length?'<div class="cards">'+data.items.map(e=>
      '<button class="record employee" data-employee-id="'+esc(e.id)+'"><div><b>'+esc(e.name)+'</b><span>社員番号 '+esc(e.employee_no)+'</span></div>'+
      '<div class="record-meta"><span>'+esc(e.office||'—')+'</span><span>'+esc(e.department||'—')+'</span><span>'+esc(e.lifecycle_status||'—')+'</span></div></button>'
    ).join('')+'</div>':empty())
  }

  async function employeeDetail(id){
    clearError();
    try{
      const {data}=await api('/employees/'+encodeURIComponent(id));
      const e=data.employee;
      $('dialogTitle').textContent=e.name||'社員詳細';
      const employeeActions=[];
      if(state.me?.role_level==='full'||state.me?.role_level==='scoped')employeeActions.push('<button class="small-primary" data-dialog-action="edit-employee">社員情報を編集</button>');
      if(state.me?.role_level==='full')employeeActions.push('<button class="small-primary" data-dialog-action="create-user-for-employee">利用者アカウント発行</button>');
      const edit=employeeActions.length?'<div class="dialog-actions">'+employeeActions.join('')+'</div>':'';
      state.dialog={type:'employee',record:e,etag:'"'+e.version+'"'};
      $('dialogBody').innerHTML='<div class="detail-grid">'+
        detail('社員番号',e.employee_no)+detail('在籍状態',e.lifecycle_status)+detail('事業所',e.office)+detail('部署',e.department)+
        detail('雇用区分',e.employment_type)+detail('職位',e.position)+detail('乗務可否',e.safety_state)+detail('固定ID',e.id)+
        '</div>'+edit;
      $('detailDialog').showModal()
    }catch(err){showError(err,'社員詳細')}
  }
  function detail(label,value){return '<div><span>'+esc(label)+'</span><b>'+esc(fmtText(value))+'</b></div>'}

  async function renderDeadlines(q){
    const sp=new URLSearchParams({filter:'action',page_size:'100'});if(q)sp.set('q',q);
    const {data}=await api('/deadlines?'+sp);
    $('content').innerHTML=
      '<div class="metric-grid compact">'+metric('全件',data.summary.total,'60日以内')+metric('超過',data.summary.overdue,'期限超過')+metric('本日',data.summary.today,'本日期限')+metric('7日以内',data.summary.within7,'近日')+'</div>'+
      listHeader(data.total,'期限')+(data.items.length?'<div class="cards">'+data.items.map(x=>
        '<div class="record"><div><b>'+esc(x.label)+'</b><span>'+esc(x.employee_name||x.employee_no||'車両・共通')+'</span></div>'+
        '<div class="record-meta"><span class="due '+esc(x.due_state)+'">'+esc(fmtDate(x.due))+'</span><span>'+esc(x.action)+'</span></div></div>'
      ).join('')+'</div>':empty())
  }

  async function renderAccidents(q){
    const sp=new URLSearchParams({page_size:'50'});if(q)sp.set('q',q);
    const {data}=await api('/accidents?'+sp);
    const add='<button class="small-primary" data-action="new-accident">＋ 事故登録</button>';
    $('content').innerHTML=listHeader(data.total,'事故',add)+(data.items.length?'<div class="cards">'+data.items.map(x=>
      '<div class="record"><div><b>'+esc(x.accident_no)+'</b><span>'+esc(x.employee_name)+' / '+esc(x.employee_no)+'</span><p>'+esc(x.summary)+'</p></div>'+
      '<div class="record-meta"><span>'+esc(fmtDate(x.occurred_on))+'</span><span>'+esc(x.phase)+'</span><span>'+esc(x.car_no||'号車未設定')+'</span><button class="record-action" data-action="edit-accident" data-id="'+esc(x.id)+'">開く</button></div></div>'
    ).join('')+'</div>':empty())
  }

  async function renderComplaints(q){
    const sp=new URLSearchParams({page_size:'50'});if(q)sp.set('q',q);
    const {data}=await api('/complaints?'+sp);
    const add='<button class="small-primary" data-action="new-complaint">＋ 苦情登録</button>';
    $('content').innerHTML=listHeader(data.total,'苦情',add)+(data.items.length?'<div class="cards">'+data.items.map(x=>
      '<div class="record"><div><b>'+esc(x.complaint_no)+'</b><span>'+esc(x.employee_name)+' / '+esc(x.employee_no)+'</span><p>'+esc(x.summary)+'</p></div>'+
      '<div class="record-meta"><span>'+esc(fmtDate(x.responded_on))+'</span><span>'+esc(x.status)+'</span><span>'+esc(x.rank||'未判定')+'</span><button class="record-action" data-action="edit-complaint" data-id="'+esc(x.id)+'">開く</button></div></div>'
    ).join('')+'</div>':empty())
  }

  async function renderVehicles(q){
    const sp=new URLSearchParams({page_size:'50'});if(q)sp.set('q',q);
    const {data}=await api('/vehicles?'+sp);
    const add='<button class="small-primary" data-action="new-vehicle">＋ 車両登録</button>';
    $('content').innerHTML=listHeader(data.total,'車両',add)+(data.items.length?'<div class="cards">'+data.items.map(v=>
      '<div class="record"><div><b>'+esc(v.car_no)+'号車</b><span>'+esc(v.model||v.service||'—')+'</span></div>'+
      '<div class="record-meta"><span>'+esc(v.status)+'</span><span>車検 '+esc(fmtDate(v.inspection_due))+'</span><span>'+esc(v.primary_employee_name||'主担当なし')+'</span><button class="record-action" data-action="edit-vehicle" data-id="'+esc(v.id)+'">開く</button></div></div>'
    ).join('')+'</div>':empty())
  }


  async function renderNearMisses(q){
    const sp=new URLSearchParams({page_size:'50'});if(q)sp.set('q',q);
    const {data}=await api('/near-misses?'+sp);
    const add='<button class="small-primary" data-action="new-near-miss">＋ ヒヤリ登録</button>';
    $('content').innerHTML=listHeader(data.total,'ヒヤリ',add)+(data.items.length?'<div class="cards">'+data.items.map(x=>
      '<div class="record"><div><b>'+esc(x.report_no)+'</b><span>'+esc(x.employee_name||'')+' / '+esc(x.employee_no||'')+'</span><p>'+esc(x.summary)+'</p></div>'+
      '<div class="record-meta"><span>'+esc(fmtDate(x.reported_on))+'</span><span>'+esc(x.risk_level||'未判定')+'</span><span>'+esc(x.car_no||'号車未設定')+'</span></div></div>'
    ).join('')+'</div>':empty())
  }

  async function renderCredentials(q){
    if(state.me?.role_level==='self'){
      state.credentialEmployeeId=state.me.employee_id;
      return renderCredentialEmployee(state.credentialEmployeeId)
    }
    if(state.credentialEmployeeId)return renderCredentialEmployee(state.credentialEmployeeId);
    const sp=new URLSearchParams({page_size:'50'});if(q)sp.set('q',q);
    const {data}=await api('/employees?'+sp);
    $('content').innerHTML=listHeader(data.total,'資格・書類の対象社員')+(data.items.length?'<div class="cards">'+data.items.map(e=>
      '<div class="record"><div><b>'+esc(e.name)+'</b><span>社員番号 '+esc(e.employee_no)+'</span></div>'+
      '<div class="record-meta"><span>'+esc(e.office||'—')+'</span><span>'+esc(e.department||'—')+'</span><button class="record-action" data-action="show-credentials" data-id="'+esc(e.id)+'">資格・書類を見る</button></div></div>'
    ).join('')+'</div>':empty())
  }

  async function renderCredentialEmployee(employeeId){
    const {data}=await api('/credentials?employee_id='+encodeURIComponent(employeeId));
    state.credentialEmployeeId=employeeId;
    const manager=state.me?.role_level==='full'||state.me?.role_level==='scoped';
    const actions=manager
      ?'<button class="small-primary" data-action="new-qualification">＋ 資格登録</button><button class="small-primary" data-action="new-document">＋ 書類登録</button><button class="small-primary" data-action="new-original-document">＋ 電子原本</button>'
      :'';
    const back=state.me?.role_level==='self'?'':'<button class="ghost light" data-action="back-credentials">← 社員選択へ</button>';
    const qs=data.qualifications||[],docs=data.documents||[];
    $('content').innerHTML=
      '<div class="hero"><div><span class="eyebrow">資格・書類</span><h2>'+esc(data.employee.name)+'</h2><p>社員番号 '+esc(data.employee.employee_no)+'</p></div><div class="dialog-actions">'+back+actions+'</div></div>'+
      '<section class="panel"><div class="list-head"><div><b>資格</b><span>'+esc(qs.length)+'件</span></div></div>'+
      (qs.length?'<div class="cards">'+qs.map(q=>
        '<div class="record"><div><b>'+esc(q.name)+'</b><span>'+esc(q.certificate_no||'証明番号なし')+'</span></div>'+
        '<div class="record-meta"><span>'+esc(q.status||'active')+'</span><span>期限 '+esc(fmtDate(q.expiry))+'</span><span>証憑 '+esc(q.evidence_requirement||'unset')+'</span></div></div>'
      ).join('')+'</div>':empty())+'</section>'+
      '<section class="panel"><div class="list-head"><div><b>書類</b><span>'+esc(docs.length)+'件</span></div></div>'+
      (docs.length?'<div class="cards">'+docs.map(d=>
        '<div class="record"><div><b>'+esc(d.name)+'</b><span>'+esc(d.category)+'</span></div>'+
        '<div class="record-meta"><span>'+esc(d.status)+'</span><span>期限 '+esc(fmtDate(d.expiry))+'</span><span>'+esc(d.original_handling)+'</span><span>'+esc(d.storage_state||'not_uploaded')+'</span>'+
        (d.storage_state==='active'&&d.malware_scan_status==='clean'?'<button class="record-action" data-action="download-original" data-id="'+esc(d.id)+'">原本を開く</button>':'')+'</div></div>'
      ).join('')+'</div>':empty())+'</section>'
  }

  async function newNotice(){
    if(state.me?.role_level!=='full')return;
    const fields=
      formField('title','件名','','text','required')+
      formArea('body','本文','','required')+
      formSelect('state','公開状態',[['draft','下書き'],['published','公開']],'draft','required');
    openRecordForm('お知らせ作成',fields,async fd=>{
      await api('/notices',{method:'POST',body:{
        title:fdText(fd,'title'),
        body:fdText(fd,'body'),
        state:fdText(fd,'state')
      }})
    })
  }

  async function newConfirmation(){
    if(state.me?.role_level!=='full')return;
    const fields=
      formField('title','確認件名','','text','required')+
      formArea('body','確認内容')+
      formField('due','回答期限','','date')+
      formSelect('state','状態',[['open','回答受付'],['draft','下書き']],'open','required');
    openRecordForm('一斉確認作成',fields,async fd=>{
      await api('/confirmations',{method:'POST',body:{
        title:fdText(fd,'title'),
        body:nullable(fdText(fd,'body')),
        due:nullable(fdText(fd,'due')),
        state:fdText(fd,'state')
      }})
    })
  }

  async function newGuidance(){
    const manager=state.me?.role_level==='full'||state.me?.role_level==='scoped';
    if(!manager)return;
    const employees=await employeeChoices();
    const fields=
      formSelect('employee_id','対象社員',employees,'','required')+
      formField('guidance_on','指導日',new Date().toISOString().slice(0,10),'date','required')+
      formField('type','指導区分','','text','required')+
      formArea('summary','指導内容','','required')+
      formField('owner','担当者',state.me?.display_name||'','text','required')+
      formField('next_review','次回確認日','','date');
    openRecordForm('指導登録',fields,async fd=>{
      await api('/guidance',{method:'POST',body:{
        employee_id:fdText(fd,'employee_id'),
        guidance_on:fdText(fd,'guidance_on'),
        type:fdText(fd,'type'),
        summary:fdText(fd,'summary'),
        owner:fdText(fd,'owner'),
        next_review:nullable(fdText(fd,'next_review'))
      }})
    })
  }

  async function acknowledgeHandoff(id){
    await api('/handoffs/'+encodeURIComponent(id)+'/acknowledge',{method:'POST'});
    await renderBusiness()
  }

  async function newApplication(){
    const manager=state.me?.role_level==='full'||state.me?.role_level==='scoped';
    let fields='';
    if(manager){
      const employees=await employeeChoices();
      fields+=formSelect('employee_id','対象社員',employees,'','required')
    }
    fields+=formField('type','申請種別','','text','required')+formArea('detail','申請内容','','required');
    openRecordForm('申請登録',fields,async fd=>{
      const body={type:fdText(fd,'type'),payload:{detail:fdText(fd,'detail')}};
      if(manager)body.employee_id=fdText(fd,'employee_id');
      await api('/applications',{method:'POST',body})
    })
  }

  async function decideApplication(id,status){
    const manager=state.me?.role_level==='full'||state.me?.role_level==='scoped';
    if(!manager)return;
    const {data}=await api('/applications?page_size=100');
    const item=(data.items||[]).find(x=>String(x.id)===String(id));
    if(!item){const e=new Error('対象申請が見つかりません');e.code='APPLICATION_NOT_FOUND';throw e}
    const label={approved:'承認',rejected:'却下',cancelled:'取消'}[status]||status;
    if(!window.confirm('この申請を「'+label+'」にしますか？'))return;
    await api('/applications/'+encodeURIComponent(id),{
      method:'PATCH',
      body:{status},
      headers:{'If-Match':'"'+item.version+'"'}
    });
    await renderBusiness()
  }

  async function markNoticeRead(id){
    await api('/notices/'+encodeURIComponent(id)+'/read',{method:'POST'});
    await renderBusiness()
  }

  async function respondConfirmation(id){
    const response=window.prompt('回答を入力してください');
    if(!response||!response.trim())return;
    await api('/confirmations/'+encodeURIComponent(id)+'/respond',{method:'POST',body:{response:response.trim()}});
    await renderBusiness()
  }

  async function renderBusiness(){
    const manager=state.me?.role_level==='full'||state.me?.role_level==='scoped';
    const requests=[
      api('/applications?page_size=50').then(x=>x.data),
      api('/notices').then(x=>x.data),
      api('/confirmations').then(x=>x.data)
    ];
    if(manager){
      requests.push(api('/guidance?page_size=50').then(x=>x.data));
      requests.push(api('/handoffs').then(x=>x.data))
    }
    const [applications,notices,confirmations,guidance,handoffs]=await Promise.all(requests);
    const appItems=applications?.items||[],noticeItems=notices?.notices||[],confirmationItems=confirmations?.confirmations||[];
    const guidanceItems=guidance?.items||[],handoffItems=handoffs?.handoffs||[];

    const applicationHtml=appItems.length?'<div class="cards">'+appItems.map(x=>
      '<div class="record"><div><b>'+esc(x.type)+'</b><span>'+esc(x.employee_name||'')+' / '+esc(x.employee_no||'')+'</span></div>'+
      '<div class="record-meta"><span>'+esc(x.status)+'</span><span>'+esc(fmtDate(x.applied_at))+'</span>'+
      (manager&&x.status==='submitted'
        ?'<button class="success" data-action="application-approve" data-id="'+esc(x.id)+'">承認</button><button class="warning" data-action="application-reject" data-id="'+esc(x.id)+'">却下</button><button class="ghost light" data-action="application-cancel" data-id="'+esc(x.id)+'">取消</button>'
        :'')+'</div></div>'
    ).join('')+'</div>':empty();

    const noticeHtml=noticeItems.length?'<div class="cards">'+noticeItems.map(x=>
      '<div class="record"><div><b>'+esc(x.title)+'</b><p>'+esc(x.body||'')+'</p></div>'+
      '<div class="record-meta"><span>'+esc(x.state)+'</span><span>'+esc(fmtDate(x.published_at||x.created_at))+'</span><span>'+(x.read?'既読':'未読')+'</span>'+
      (!x.read&&x.state==='published'?'<button class="record-action" data-action="read-notice" data-id="'+esc(x.id)+'">既読にする</button>':'')+'</div></div>'
    ).join('')+'</div>':empty();

    const confirmationHtml=confirmationItems.length?'<div class="cards">'+confirmationItems.map(x=>
      '<div class="record"><div><b>'+esc(x.title)+'</b><p>'+esc(x.body||'')+'</p></div>'+
      '<div class="record-meta"><span>'+esc(x.state)+'</span><span>期限 '+esc(fmtDate(x.due))+'</span><span>'+esc(x.response||'未回答')+'</span>'+
      (x.state==='open'?'<button class="record-action" data-action="respond-confirmation" data-id="'+esc(x.id)+'">回答</button>':'')+'</div></div>'
    ).join('')+'</div>':empty();

    const guidanceHtml=guidanceItems.length?'<div class="cards">'+guidanceItems.map(x=>
      '<div class="record"><div><b>'+esc(x.type)+'</b><span>'+esc(x.employee_name||'')+' / '+esc(x.employee_no||'')+'</span><p>'+esc(x.summary||'')+'</p></div>'+
      '<div class="record-meta"><span>'+esc(fmtDate(x.guidance_on))+'</span><span>'+esc(x.owner||'担当未設定')+'</span><span>次回 '+esc(fmtDate(x.next_review))+'</span></div></div>'
    ).join('')+'</div>':empty();

    const handoffHtml=handoffItems.length?'<div class="cards">'+handoffItems.map(x=>
      '<div class="record"><div><b>'+esc(x.case_type)+' / '+esc(x.case_id)+'</b><p>'+esc(x.note||'')+'</p></div>'+
      '<div class="record-meta"><span>'+esc(x.status)+'</span><span>'+esc(fmtDate(x.created_at))+'</span>'+
      (x.status==='pending'&&String(x.to_user_id)===String(state.me?.id)?'<button class="record-action" data-action="ack-handoff" data-id="'+esc(x.id)+'">確認済みにする</button>':'')+'</div></div>'
    ).join('')+'</div>':empty();

    $('content').innerHTML=
      '<section class="panel"><div class="list-head"><div><b>申請</b><span>'+esc(applications?.total||0)+'件</span></div><button class="small-primary" data-action="new-application">＋ 申請</button></div>'+applicationHtml+'</section>'+
      '<section class="panel"><div class="list-head"><div><b>お知らせ</b><span>'+esc(noticeItems.length)+'件</span></div>'+
      (state.me?.role_level==='full'?'<button class="small-primary" data-action="new-notice">＋ お知らせ</button>':'')+
      '</div>'+noticeHtml+'</section>'+
      '<section class="panel"><div class="list-head"><div><b>一斉確認</b><span>'+esc(confirmationItems.length)+'件</span></div>'+
      (state.me?.role_level==='full'?'<button class="small-primary" data-action="new-confirmation">＋ 一斉確認</button>':'')+
      '</div>'+confirmationHtml+'</section>'+
      (manager?'<section class="panel"><div class="list-head"><div><b>指導</b><span>'+esc(guidance?.total||0)+'件</span></div><button class="small-primary" data-action="new-guidance">＋ 指導登録</button></div>'+guidanceHtml+'</section>':'')+
      (manager?'<section class="panel"><div class="list-head"><div><b>引継ぎ</b><span>'+esc(handoffItems.length)+'件</span></div></div>'+handoffHtml+'</section>':'')
  }

  async function renderUsers(q){
    if(state.me?.role_level!=='full'){
      $('content').innerHTML='<div class="empty">利用者管理は全社管理者のみ利用できます。</div>';return
    }
    const sp=new URLSearchParams({page_size:'100'});if(q)sp.set('q',q);
    const {data}=await api('/users?'+sp);
    state.userItems=data.items||[];
    $('content').innerHTML=listHeader(data.total,'利用者')+(state.userItems.length?'<div class="cards">'+state.userItems.map(u=>
      '<div class="record"><div><b>'+esc(u.display_name)+'</b><span>'+esc(u.login_id)+' / 社員番号 '+esc(u.employee_no)+'</span>'+
      '<p>'+esc(u.employee_name||'')+' / '+esc(roleLabel(u.role_level))+' / '+esc(u.state)+'</p></div>'+
      '<div class="record-meta"><span>MFA '+esc(u.mfa_enrolled_at?'登録済':'未登録')+'</span><span>セッション '+esc(u.active_sessions||0)+'</span>'+
      '<button class="record-action" data-action="edit-user" data-id="'+esc(u.id)+'">権限</button>'+
      (u.state==='active'
        ?'<button class="warning" data-action="suspend-user" data-id="'+esc(u.id)+'">停止</button>'
        :'<button class="success" data-action="reactivate-user" data-id="'+esc(u.id)+'">再開</button>')+
      '</div></div>'
    ).join('')+'</div>':empty())
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
      formSelect('role_level','権限',[['self','本人'],['scoped','担当範囲管理者'],['full','全社管理者']],u.role_level,'required')+
      formSelect('safety_authority','安全管理権限',[['false','なし'],['true','あり']],String(Boolean(u.safety_authority)))+
      formArea('scopes','担当範囲（scopedのみ）',userScopesText(u.scopes),'placeholder="本社 | タクシー課&#10;府中 | タクシー課"');
    openRecordForm('利用者権限 '+u.display_name,fields,async fd=>{
      const role=fdText(fd,'role_level');
      const scopes=role==='scoped'?parseUserScopes(fdText(fd,'scopes')):[];
      await api('/users/'+encodeURIComponent(u.id)+'/access',{
        method:'PATCH',
        body:{role_level:role,safety_authority:fdText(fd,'safety_authority')==='true',scopes},
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

  async function renderSafetyAnalysis(){
    if(state.me?.role_level==='self'){
      $('content').innerHTML='<div class="empty">安全分析は管理者のみ利用できます。</div>';return
    }
    const sp=new URLSearchParams();
    for(const [k,v] of Object.entries(state.analysisFilters||{}))if(v)sp.set(k,v);
    const {data}=await api('/analysis/safety-summary'+(sp.toString()?'?'+sp.toString():''));
    const a=data.analysis||{},k=a.kpis||{},t=a.totals||{},trend=a.trend||[],departments=a.departments||[];
    const pct=v=>Number(v||0).toFixed(1)+'%';
    $('content').innerHTML=
      '<section class="panel"><div class="list-head"><div><b>分析条件</b><span>記録時所属snapshotで集計</span></div></div>'+
      '<div class="filter-grid">'+
        '<label>開始日<input id="analysisFrom" type="date" value="'+esc(a.filters?.from||'')+'"></label>'+
        '<label>終了日<input id="analysisTo" type="date" value="'+esc(a.filters?.to||'')+'"></label>'+
        '<label>事業所<input id="analysisOffice" value="'+esc(a.filters?.office||'')+'" placeholder="全事業所"></label>'+
        '<label>部署<input id="analysisDepartment" value="'+esc(a.filters?.department||'')+'" placeholder="全部署"></label>'+
      '</div><div class="dialog-actions"><button class="ghost light" data-action="analysis-clear">条件解除</button><button class="small-primary" data-action="analysis-apply">この条件で集計</button></div></section>'+
      '<div class="metric-grid">'+
        metric('事故',t.accidents||0,'対象期間')+
        metric('ヒヤリ',t.near_misses||0,'対象期間')+
        metric('苦情',t.complaints||0,'対象期間')+
        metric('未完了比率',pct(k.open_case_ratio),'事故・苦情')+
      '</div>'+
      '<div class="metric-grid">'+
        metric('高リスクヒヤリ',pct(k.high_risk_near_miss_ratio),'ヒヤリ内')+
        metric('平均修理費',Number(k.average_repair_cost||0).toLocaleString()+'円','事故平均')+
        metric('分析項目充足',pct(k.analysis_completeness_ratio),'原因・再発防止等')+
        metric('snapshot充足',pct(k.snapshot_completeness_ratio),'記録時所属')+
      '</div>'+
      '<section class="panel"><div class="list-head"><div><b>月別推移</b><span>'+esc(trend.length)+'か月</span></div></div>'+
      (trend.length?'<div class="table-wrap"><table><thead><tr><th>月</th><th>事故</th><th>ヒヤリ</th><th>苦情</th></tr></thead><tbody>'+
        trend.map(x=>'<tr><td>'+esc(x.month)+'</td><td>'+esc(x.accident)+'</td><td>'+esc(x.near_miss)+'</td><td>'+esc(x.complaint)+'</td></tr>').join('')+
        '</tbody></table></div>':empty())+'</section>'+
      '<section class="panel"><div class="list-head"><div><b>部署別比較</b><span>'+esc(departments.length)+'区分</span></div></div>'+
      '<p class="sub">'+esc(a.notes?.reference_per_100||'現在在籍人数を分母にした参考値です。')+'</p>'+
      (departments.length?'<div class="table-wrap"><table><thead><tr><th>事業所</th><th>部署</th><th>事故</th><th>ヒヤリ</th><th>苦情</th><th>現在在籍</th><th>100人あたり参考</th></tr></thead><tbody>'+
        departments.map(x=>'<tr><td>'+esc(x.office_snapshot||'—')+'</td><td>'+esc(x.department_snapshot||'—')+'</td><td>'+esc(x.accident_count)+'</td><td>'+esc(x.near_miss_count)+'</td><td>'+esc(x.complaint_count)+'</td><td>'+esc(x.active_employee_count)+'</td><td>'+esc(x.reference_per_100??'—')+'</td></tr>').join('')+
        '</tbody></table></div>':empty())+'</section>'
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
    if(state.me?.role_level!=='full'){
      $('content').innerHTML='<div class="empty">勤務取込は全社管理者のみ利用できます。</div>';
      return
    }
    const {data:history}=await api('/work-import/history?page_size=30');
    const current=state.workImport;
    const p=current?.preflight||null;
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
    const preflight=p?'<section class="panel"><div class="list-head"><div><b>前チェック結果</b><span>'+esc(p.row_count)+'行</span></div>'+
      (p.can_commit?'<button class="small-primary" data-action="work-import-commit">この内容で取込</button>':'')+'</div>'+
      '<div class="metric-grid compact">'+
        metric('対象行',p.row_count,'最大5,000行')+
        metric('エラー',p.blocking_issue_count,'0件で取込可')+
        metric('警告',p.warning_count,'要確認')+
        metric('残業60h以上',p.overtime_60_count,'重点確認')+
      '</div><div class="mini">ファイル '+esc(p.file_name)+' / SHA-256 '+esc(p.sha256.slice(0,16))+'… / シート '+esc(p.sheet)+'</div>'+
      issueList+warningList+preview+'</section>':'';
    const items=history.items||[];
    const historyHtml=items.length?'<div class="cards">'+items.map(x=>
      '<div class="record"><div><b>'+esc(x.file_name)+'</b><span>'+esc(x.sha256?.slice(0,16)||'')+'…</span><p>行 '+esc(x.row_count)+' / 新規 '+esc(x.inserted_count)+' / 更新 '+esc(x.updated_count)+' / 変更なし '+esc(x.unchanged_count)+'</p></div>'+
      '<div class="record-meta"><span>'+esc(x.status)+'</span><span>'+esc(fmtDate(x.committed_at||x.created_at))+'</span>'+
      (x.status==='committed'?'<button class="warning" data-action="work-import-rollback" data-id="'+esc(x.id)+'">ロールバック</button>':'')+
      '</div></div>'
    ).join('')+'</div>':empty();
    $('content').innerHTML=
      '<section class="panel"><h3>勤務集計Excel取込</h3><p class="sub">4MB以下・最大5,000行。まず前チェックを行い、内容確認後に保存します。</p>'+
      '<div class="upload-row"><input id="workImportFile" type="file" accept=".xlsx,application/vnd.openxmlformats-officedocument.spreadsheetml.sheet">'+
      '<button class="small-primary" data-action="work-import-preflight">前チェック</button></div>'+
      (current?.file?'<div class="mini">選択済み: '+esc(current.file.name)+' / '+esc(Math.round(current.file.size/1024))+'KB</div>':'')+
      '</section>'+preflight+
      '<section class="panel"><div class="list-head"><div><b>取込履歴</b><span>'+esc(history.total||0)+'件</span></div></div>'+historyHtml+'</section>'
  }

  async function workImportPreflight(){
    const input=$('workImportFile'),file=input?.files?.[0]||state.workImport?.file;
    if(!file){const e=new Error('Excelファイルを選択してください');e.code='WORK_FILE_REQUIRED';throw e}
    if(file.size>4*1024*1024){const e=new Error('勤務取込ファイルは4MB以下にしてください');e.code='WORK_FILE_TOO_LARGE';throw e}
    const {data}=await apiRaw('/work-import/preflight?file_name='+encodeURIComponent(file.name),{body:file});
    state.workImport={file,preflight:data.preflight};
    await renderWorkImport()
  }

  async function workImportCommit(){
    const current=state.workImport;
    if(!current?.file||!current?.preflight?.can_commit){const e=new Error('前チェックをやり直してください');e.code='WORK_PREFLIGHT_REQUIRED';throw e}
    await apiRaw('/work-import/commit?file_name='+encodeURIComponent(current.file.name),{
      body:current.file,
      headers:{'X-Preflight-Sha256':current.preflight.sha256}
    });
    state.workImport=null;
    await renderWorkImport()
  }

  async function workImportRollback(id){
    const reason=window.prompt('ロールバック理由を入力してください');
    if(!reason||reason.trim().length<3)return;
    await api('/work-import/'+encodeURIComponent(id)+'/rollback',{method:'POST',body:{reason:reason.trim()}});
    await renderWorkImport()
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
  function formFile(name,label,accept,extra=''){
    return '<label class="wide">'+esc(label)+'<input name="'+esc(name)+'" type="file" accept="'+esc(accept)+'" '+extra+'></label>'
  }
  function openRecordForm(title,fields,onSubmit,{actions=''}={}){
    $('dialogTitle').textContent=title;
    $('dialogBody').innerHTML='<form id="recordForm" class="edit-form"><div class="edit-grid">'+fields+'</div><div class="dialog-actions">'+actions+'<button type="button" class="ghost light" data-dialog-close>キャンセル</button><button class="small-primary" type="submit">保存</button></div></form>';
    const form=$('recordForm');
    form.onsubmit=async e=>{
      e.preventDefault();clearError();
      const submit=form.querySelector('[type="submit"]');submit.disabled=true;
      try{await onSubmit(new FormData(form));$('detailDialog').close();await loadView(state.view,{q:$('searchInput').value.trim()})}
      catch(err){showError(err,'保存')}finally{submit.disabled=false}
    };
    $('detailDialog').showModal()
  }
  async function employeeChoices(){
    const {data}=await api('/employees?page_size=100');
    return data.items.map(e=>[e.id,e.employee_no+' '+e.name])
  }
  function fdText(fd,name){return String(fd.get(name)||'').trim()}
  function nullable(v){const s=String(v||'').trim();return s||null}

  async function handleAction(action,id){
    try{
      if(action==='new-employee')return newEmployee();
      if(action==='new-accident')return newAccident();
      if(action==='edit-accident')return editAccident(id);
      if(action==='new-complaint')return newComplaint();
      if(action==='edit-complaint')return editComplaint(id);
      if(action==='new-vehicle')return newVehicle();
      if(action==='edit-vehicle')return editVehicle(id);
      if(action==='new-near-miss')return newNearMiss();
      if(action==='show-credentials'){state.credentialEmployeeId=id;return renderCredentialEmployee(id)}
      if(action==='back-credentials'){state.credentialEmployeeId=null;return renderCredentials($('searchInput').value.trim())}
      if(action==='new-qualification')return newQualification();
      if(action==='new-document')return newDocumentMetadata();
      if(action==='new-original-document')return newOriginalDocument();
      if(action==='download-original')return downloadOriginal(id);
      if(action==='work-import-preflight')return workImportPreflight();
      if(action==='work-import-commit')return workImportCommit();
      if(action==='work-import-rollback')return workImportRollback(id);
      if(action==='analysis-apply')return applyAnalysisFilters();
      if(action==='analysis-clear'){state.analysisFilters={};return renderSafetyAnalysis()}
      if(action==='edit-user')return editUserAccess(id);
      if(action==='suspend-user')return changeUserState(id,'suspended');
      if(action==='reactivate-user')return changeUserState(id,'active');
      if(action==='new-application')return newApplication();
      if(action==='read-notice')return markNoticeRead(id);
      if(action==='respond-confirmation')return respondConfirmation(id);
      if(action==='application-approve')return decideApplication(id,'approved');
      if(action==='application-reject')return decideApplication(id,'rejected');
      if(action==='application-cancel')return decideApplication(id,'cancelled');
      if(action==='new-guidance')return newGuidance();
      if(action==='ack-handoff')return acknowledgeHandoff(id);
      if(action==='new-notice')return newNotice();
      if(action==='new-confirmation')return newConfirmation()
    }catch(err){showError(err,'操作')}
  }
  async function handleDialogAction(action){
    const d=state.dialog;if(!d)return;
    try{
      if(action==='edit-employee')return editEmployee(d.record);
      if(action==='create-user-for-employee')return createUserForEmployee(d.record);
      if(action==='complete-accident')return terminalAction('accident','complete',d.record);
      if(action==='reopen-accident')return terminalAction('accident','reopen',d.record);
      if(action==='complete-complaint')return terminalAction('complaint','complete',d.record);
      if(action==='reopen-complaint')return terminalAction('complaint','reopen',d.record)
    }catch(err){showError(err,'操作')}
  }

  async function createUserForEmployee(employee){
    if(state.me?.role_level!=='full'||!employee?.id)return;
    const fields=
      formField('login_id','ログインID','','text','required maxlength="128"')+
      formField('display_name','表示名',employee.name||'','text','required')+
      formSelect('role_level','権限',[['self','本人'],['scoped','担当範囲管理者'],['full','全社管理者']],'self','required')+
      formSelect('safety_authority','安全管理権限',[['false','なし'],['true','あり']],'false')+
      formArea('scopes','担当範囲（scopedのみ）','','placeholder="本社 | タクシー課&#10;府中 | タクシー課"');
    openRecordForm('利用者アカウント発行',fields,async fd=>{
      const role=fdText(fd,'role_level');
      const scopes=role==='scoped'?parseUserScopes(fdText(fd,'scopes')):[];
      const {data}=await api('/users',{method:'POST',body:{
        employee_id:employee.id,
        login_id:fdText(fd,'login_id'),
        display_name:fdText(fd,'display_name'),
        role_level:role,
        safety_authority:fdText(fd,'safety_authority')==='true',
        scopes
      }});
      window.prompt('初期設定トークンです。30分以内に本人へ安全な方法で渡してください。\nこの画面を閉じると再表示できません。',data.setup_token||'')
    })
  }

  async function newQualification(){
    if(!state.credentialEmployeeId||state.me?.role_level==='self')return;
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

  async function newDocumentMetadata(){
    if(!state.credentialEmployeeId||state.me?.role_level==='self')return;
    const [{data:policyData},{data:credentialData}]=await Promise.all([
      api('/document-policies'),
      api('/credentials?employee_id='+encodeURIComponent(state.credentialEmployeeId))
    ]);
    const policies=(policyData.policies||[]).filter(p=>!['electronic_original','paper_and_electronic'].includes(p.original_handling));
    if(!policies.length){
      const e=new Error('通常登録できる書類区分がありません。電子原本は原本アップロード経路を使用してください。');
      e.code='NO_METADATA_DOCUMENT_POLICY';throw e
    }
    const qualificationOptions=[['','資格へ紐付けない'],...(credentialData.qualifications||[]).map(q=>[q.id,q.name+(q.expiry?' / '+fmtDate(q.expiry):'')])];
    const policyOptions=policies.map(p=>[p.category,p.category+' / '+p.original_handling]);
    const fields=
      formSelect('category','書類区分',policyOptions,policyOptions[0]?.[0]||'','required')+
      formField('name','書類名','','text','required')+
      formSelect('qualification_id','関連資格',qualificationOptions,'')+
      formField('kind','種類')+
      formField('registered_on','登録日',new Date().toISOString().slice(0,10),'date','required')+
      formField('expiry','有効期限','','date')+
      formField('paper_location','紙原本の保管場所')+
      formField('retention_until','保管期限','','date');
    openRecordForm('書類登録',fields,async fd=>{
      await api('/documents',{method:'POST',body:{
        employee_id:state.credentialEmployeeId,
        category:fdText(fd,'category'),
        name:fdText(fd,'name'),
        qualification_id:nullable(fdText(fd,'qualification_id')),
        kind:nullable(fdText(fd,'kind')),
        registered_on:fdText(fd,'registered_on'),
        expiry:nullable(fdText(fd,'expiry')),
        paper_location:nullable(fdText(fd,'paper_location')),
        retention_until:nullable(fdText(fd,'retention_until'))
      }})
    })
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
    if(!state.credentialEmployeeId||state.me?.role_level==='self')return;
    const [{data:policyData},{data:credentialData}]=await Promise.all([
      api('/document-policies'),
      api('/credentials?employee_id='+encodeURIComponent(state.credentialEmployeeId))
    ]);
    const policies=(policyData.policies||[]).filter(p=>['electronic_original','paper_and_electronic'].includes(p.original_handling));
    if(!policies.length){
      const e=new Error('電子原本の対象となる書類区分がありません。');e.code='NO_ORIGINAL_DOCUMENT_POLICY';throw e
    }
    const qualificationOptions=[['','資格へ紐付けない'],...(credentialData.qualifications||[]).map(q=>[q.id,q.name+(q.expiry?' / '+fmtDate(q.expiry):'')])];
    const policyOptions=policies.map(p=>[p.category,p.category+' / '+p.original_handling]);
    const fields=
      formSelect('category','書類区分',policyOptions,policyOptions[0]?.[0]||'','required')+
      formField('name','書類名','','text','required')+
      formSelect('qualification_id','関連資格',qualificationOptions,'')+
      formField('kind','種類')+
      formField('registered_on','登録日',new Date().toISOString().slice(0,10),'date','required')+
      formField('expiry','有効期限','','date')+
      formField('paper_location','紙原本の保管場所')+
      formField('retention_until','保管期限','','date')+
      formFile('original_file','電子原本','application/pdf,image/jpeg,image/png,image/webp','required');
    openRecordForm('電子原本登録',fields,async fd=>{
      const file=fd.get('original_file');
      if(!(file instanceof File)||!file.size){const e=new Error('原本ファイルを選択してください');e.code='ORIGINAL_FILE_REQUIRED';throw e}
      const sha256=await sha256File(file);
      const ticket=(await api('/documents/upload-ticket',{method:'POST',body:{
        employee_id:state.credentialEmployeeId,
        category:fdText(fd,'category'),
        name:fdText(fd,'name'),
        qualification_id:nullable(fdText(fd,'qualification_id')),
        kind:nullable(fdText(fd,'kind')),
        registered_on:fdText(fd,'registered_on'),
        expiry:nullable(fdText(fd,'expiry')),
        paper_location:nullable(fdText(fd,'paper_location')),
        retention_until:nullable(fdText(fd,'retention_until')),
        content_type:file.type,
        size_bytes:file.size,
        sha256,
        original_file_name:file.name
      }})).data;
      const upload=await fetch(ticket.upload.url,{method:ticket.upload.method||'PUT',headers:{'Content-Type':ticket.upload.content_type||file.type},body:file,credentials:'omit',cache:'no-store'});
      if(!upload.ok){const e=new Error('原本ファイルを隔離領域へ保存できませんでした');e.code='ORIGINAL_UPLOAD_FAILED';throw e}
      await api('/documents/finalize',{method:'POST',body:{ticket_id:ticket.ticket_id}})
    })
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
      formField('hired_on','入社日','','date');
    openRecordForm('社員登録',fields,async fd=>{
      await api('/employees',{method:'POST',body:{
        employee_no:fdText(fd,'employee_no'),name:fdText(fd,'name'),furigana:nullable(fdText(fd,'furigana')),
        office:fdText(fd,'office'),department:fdText(fd,'department'),position:nullable(fdText(fd,'position')),
        employment_type:nullable(fdText(fd,'employment_type')),hired_on:nullable(fdText(fd,'hired_on'))
      }})
    })
  }

  function editEmployee(e){
    const fields=
      formField('name','氏名',e.name,'text','required')+formField('furigana','フリガナ',e.furigana)+
      formField('position','職位',e.position)+formField('taxi_section','タクシー課区分',e.taxi_section)+
      formField('team','班',e.team)+formField('employment_type','雇用区分',e.employment_type)+
      formField('work_pattern','勤務区分',e.work_pattern)+formField('main_license','主免許',e.main_license)+
      formField('license_expiry','免許期限',fmtDate(e.license_expiry)==='—'?'':fmtDate(e.license_expiry),'date')+
      formField('health_check_due','健康診断期限',fmtDate(e.health_check_due)==='—'?'':fmtDate(e.health_check_due),'date')+
      formField('aptitude_due','適性診断期限',fmtDate(e.aptitude_due)==='—'?'':fmtDate(e.aptitude_due),'date');
    openRecordForm('社員情報を編集',fields,async fd=>{
      const body={};for(const k of ['name','furigana','position','taxi_section','team','employment_type','work_pattern','main_license','license_expiry','health_check_due','aptitude_due'])body[k]=nullable(fdText(fd,k));
      await api('/employees/'+encodeURIComponent(e.id),{method:'PATCH',body,headers:{'If-Match':'"'+e.version+'"'}})
    })
  }

  async function newAccident(){
    const employees=await employeeChoices();
    const fields=formSelect('employee_id','対象社員',employees,'','required')+
      formField('occurred_on','発生日',new Date().toISOString().slice(0,10),'date','required')+
      formField('car_no','号車')+formField('address','場所','','text','required')+
      formArea('summary','事故内容','','required')+formArea('cause','原因')+formArea('prevention','再発防止')+
      formArea('response_history','対応履歴')+formField('followup_due','フォロー期限','','date');
    openRecordForm('事故登録',fields,async fd=>{
      await api('/accidents',{method:'POST',body:{
        employee_id:fdText(fd,'employee_id'),occurred_on:fdText(fd,'occurred_on'),car_no:nullable(fdText(fd,'car_no')),
        address:fdText(fd,'address'),summary:fdText(fd,'summary'),cause:nullable(fdText(fd,'cause')),
        prevention:nullable(fdText(fd,'prevention')),response_history:nullable(fdText(fd,'response_history')),followup_due:nullable(fdText(fd,'followup_due'))
      }})
    })
  }

  async function editAccident(id){
    const {data}=await api('/accidents/'+encodeURIComponent(id));const a=data.accident;state.dialog={type:'accident',record:a};
    const terminal=a.phase==='completed';
    const fields=formField('occurred_on','発生日',fmtDate(a.occurred_on),'date','required')+formField('car_no','号車',a.car_no)+
      formField('address','場所',a.address,'text','required')+formArea('summary','事故内容',a.summary,'required')+
      formArea('cause','原因',a.cause)+formArea('prevention','再発防止',a.prevention)+formArea('response_history','対応履歴',a.response_history)+
      formArea('next_action','次回対応',a.next_action)+formField('followup_due','フォロー期限',fmtDate(a.followup_due)==='—'?'':fmtDate(a.followup_due),'date');
    const actions=terminal?'<button type="button" class="warning" data-dialog-action="reopen-accident">理由を入力して再開</button>':'<button type="button" class="success" data-dialog-action="complete-accident">完了</button>';
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

  async function newComplaint(){
    const employees=await employeeChoices();
    const fields=formSelect('employee_id','対象社員',employees,'','required')+
      formField('responded_on','対応日',new Date().toISOString().slice(0,10),'date','required')+
      formArea('summary','苦情内容','','required')+
      formSelect('rank','ランク',[['unrated','未判定'],['A','A'],['B','B'],['C','C']],'unrated')+
      formArea('guidance_content','指導内容')+formArea('next_action','次回対応')+formField('followup_due','フォロー期限','','date');
    openRecordForm('苦情登録',fields,async fd=>{
      await api('/complaints',{method:'POST',body:{
        employee_id:fdText(fd,'employee_id'),responded_on:fdText(fd,'responded_on'),summary:fdText(fd,'summary'),
        rank:fdText(fd,'rank'),guidance_content:nullable(fdText(fd,'guidance_content')),
        next_action:nullable(fdText(fd,'next_action')),followup_due:nullable(fdText(fd,'followup_due'))
      }})
    })
  }

  async function editComplaint(id){
    const {data}=await api('/complaints/'+encodeURIComponent(id));const a=data.complaint;state.dialog={type:'complaint',record:a};
    const terminal=a.status==='completed';
    const fields=formField('responded_on','対応日',fmtDate(a.responded_on),'date','required')+
      formArea('summary','苦情内容',a.summary,'required')+
      formSelect('rank','ランク',[['unrated','未判定'],['A','A'],['B','B'],['C','C']],a.rank||'unrated')+
      formArea('guidance_content','指導内容',a.guidance_content)+formArea('next_action','次回対応',a.next_action)+
      formField('followup_due','フォロー期限',fmtDate(a.followup_due)==='—'?'':fmtDate(a.followup_due),'date');
    const actions=terminal?'<button type="button" class="warning" data-dialog-action="reopen-complaint">理由を入力して再開</button>':'<button type="button" class="success" data-dialog-action="complete-complaint">完了</button>';
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

  async function newNearMiss(){
    const manager=state.me?.role_level==='full'||state.me?.role_level==='scoped';
    let fields='';
    if(manager){
      const employees=await employeeChoices();
      fields+=formSelect('employee_id','対象社員',employees,'','required')
    }
    fields+=formField('occurred_on','発生日',new Date().toISOString().slice(0,10),'date','required')+
      formField('occurred_time','発生時刻','','time')+
      formField('reported_on','報告日',new Date().toISOString().slice(0,10),'date','required')+
      formField('car_no','号車')+
      formSelect('risk_level','リスク',[['','未判定'],['low','低'],['medium','中'],['high','高']], '')+
      formArea('summary','内容','','required')+
      formArea('prevention','再発防止')+
      formArea('education','指導・教育');
    openRecordForm('ヒヤリ登録',fields,async fd=>{
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
      if(manager)body.employee_id=fdText(fd,'employee_id');
      await api('/near-misses',{method:'POST',body})
    })
  }

  async function newVehicle(){
    const employees=await employeeChoices();
    const options=[['','主担当なし'],...employees];
    const fields=formField('car_no','3桁号車','','text','required pattern="[0-9]{3}"')+
      formField('model','車種')+formField('service','用途')+
      formSelect('assignment_mode','区分',[['spare','予備'],['shared','共用'],['dedicated','専属'],['loaner','貸出']],'spare')+
      formSelect('primary_employee_id','主担当',options,'')+
      formField('inspection_due','車検期限','','date','required')+formField('next_maintenance_due','次回整備','','date')+formArea('maintenance_note','整備メモ');
    openRecordForm('車両登録',fields,async fd=>{
      await api('/vehicles',{method:'POST',body:{
        car_no:fdText(fd,'car_no'),model:nullable(fdText(fd,'model')),service:nullable(fdText(fd,'service')),
        assignment_mode:fdText(fd,'assignment_mode'),primary_employee_id:nullable(fdText(fd,'primary_employee_id')),
        inspection_due:fdText(fd,'inspection_due'),next_maintenance_due:nullable(fdText(fd,'next_maintenance_due')),
        maintenance_note:nullable(fdText(fd,'maintenance_note'))
      }})
    })
  }

  async function editVehicle(id){
    const {data}=await api('/vehicles/'+encodeURIComponent(id));const v=data.vehicle;state.dialog={type:'vehicle',record:v};
    const fields=formField('model','車種',v.model)+formField('service','用途',v.service)+
      formSelect('status','状態',[['active','稼働'],['maintenance','整備'],['inactive','停止']],v.status||'active')+
      formSelect('assignment_mode','区分',[['spare','予備'],['shared','共用'],['dedicated','専属'],['loaner','貸出']],v.assignment_mode||'spare')+
      formField('inspection_due','車検期限',fmtDate(v.inspection_due)==='—'?'':fmtDate(v.inspection_due),'date','required')+
      formField('next_maintenance_due','次回整備',fmtDate(v.next_maintenance_due)==='—'?'':fmtDate(v.next_maintenance_due),'date')+
      formArea('maintenance_note','整備メモ',v.maintenance_note);
    openRecordForm('車両 '+v.car_no+'号車',fields,async fd=>{
      const body={};for(const k of ['model','service','status','assignment_mode','inspection_due','next_maintenance_due','maintenance_note'])body[k]=nullable(fdText(fd,k));
      await api('/vehicles/'+encodeURIComponent(v.id),{method:'PATCH',body,headers:{'If-Match':'"'+v.version+'"'}})
    })
  }

  window.addEventListener('DOMContentLoaded',boot);
})();