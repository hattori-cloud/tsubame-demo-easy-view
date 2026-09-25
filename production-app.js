(() => {
  'use strict';

  const state={me:null,view:'home',challenge:null,enrollment:null,loading:false,lastRequestId:''};
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
      const row=e.target.closest('[data-employee-id]');
      if(row)employeeDetail(row.dataset.employeeId)
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
    for(const view of ['accidents','complaints','vehicles']){
      const button=$('nav').querySelector('[data-view="'+view+'"]');
      if(button)button.hidden=!manager
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
    [...$('nav').querySelectorAll('[data-view]')].forEach(b=>b.classList.toggle('active',b.dataset.view===view))
  }

  async function loadView(view,opts={}){
    if(state.loading)return;
    state.loading=true;state.view=view;navActive(view);clearError();
    $('viewTitle').textContent={home:'ホーム',employees:'社員',deadlines:'期限センター',accidents:'事故',complaints:'苦情',vehicles:'車両'}[view]||view;
    $('searchWrap').hidden=view==='home';
    $('content').innerHTML='<div class="loading">読込中…</div>';
    try{
      if(view==='home')await renderHome();
      else if(view==='employees')await renderEmployees(opts.q||'');
      else if(view==='deadlines')await renderDeadlines(opts.q||'');
      else if(view==='accidents')await renderAccidents(opts.q||'');
      else if(view==='complaints')await renderComplaints(opts.q||'');
      else if(view==='vehicles')await renderVehicles(opts.q||'')
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

  function listHeader(total,label){return '<div class="list-head"><b>'+esc(label)+'</b><span>'+esc(total)+'件</span></div>'}
  function empty(){return '<div class="empty">該当データはありません。</div>'}

  async function renderEmployees(q){
    const sp=new URLSearchParams({page_size:'50'});if(q)sp.set('q',q);
    const {data}=await api('/employees?'+sp);
    $('content').innerHTML=listHeader(data.total,'社員')+(data.items.length?'<div class="cards">'+data.items.map(e=>
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
      $('dialogBody').innerHTML='<div class="detail-grid">'+
        detail('社員番号',e.employee_no)+detail('在籍状態',e.lifecycle_status)+detail('事業所',e.office)+detail('部署',e.department)+
        detail('雇用区分',e.employment_type)+detail('職位',e.position)+detail('乗務可否',e.safety_state)+detail('固定ID',e.id)+
        '</div>';
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
    $('content').innerHTML=listHeader(data.total,'事故')+(data.items.length?'<div class="cards">'+data.items.map(x=>
      '<div class="record"><div><b>'+esc(x.accident_no)+'</b><span>'+esc(x.employee_name)+' / '+esc(x.employee_no)+'</span><p>'+esc(x.summary)+'</p></div>'+
      '<div class="record-meta"><span>'+esc(fmtDate(x.occurred_on))+'</span><span>'+esc(x.phase)+'</span><span>'+esc(x.car_no||'号車未設定')+'</span></div></div>'
    ).join('')+'</div>':empty())
  }

  async function renderComplaints(q){
    const sp=new URLSearchParams({page_size:'50'});if(q)sp.set('q',q);
    const {data}=await api('/complaints?'+sp);
    $('content').innerHTML=listHeader(data.total,'苦情')+(data.items.length?'<div class="cards">'+data.items.map(x=>
      '<div class="record"><div><b>'+esc(x.complaint_no)+'</b><span>'+esc(x.employee_name)+' / '+esc(x.employee_no)+'</span><p>'+esc(x.summary)+'</p></div>'+
      '<div class="record-meta"><span>'+esc(fmtDate(x.responded_on))+'</span><span>'+esc(x.status)+'</span><span>'+esc(x.rank||'未判定')+'</span></div></div>'
    ).join('')+'</div>':empty())
  }

  async function renderVehicles(q){
    const sp=new URLSearchParams({page_size:'50'});if(q)sp.set('q',q);
    const {data}=await api('/vehicles?'+sp);
    $('content').innerHTML=listHeader(data.total,'車両')+(data.items.length?'<div class="cards">'+data.items.map(v=>
      '<div class="record"><div><b>'+esc(v.car_no)+'号車</b><span>'+esc(v.model||v.service||'—')+'</span></div>'+
      '<div class="record-meta"><span>'+esc(v.status)+'</span><span>車検 '+esc(fmtDate(v.inspection_due))+'</span><span>'+esc(v.primary_employee_name||'主担当なし')+'</span></div></div>'
    ).join('')+'</div>':empty())
  }

  window.addEventListener('DOMContentLoaded',boot);
})();