const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const src=(...p)=>fs.readFileSync(path.join(__dirname,'..',...p),'utf8');

test('selected-user production model rejects legacy self login and account creation',()=>{
  const login=src('api','v1','auth','login.js');
  const authStore=src('api','_lib','auth-store.js');
  const userStore=src('api','_lib','user-store.js');
  assert.ok(login.includes("account.role_level!=='self'"));
  assert.ok(authStore.includes("u.role_level<>'self'"));
  assert.ok(userStore.includes("!['full','scoped'].includes(roleLevel)"));
  assert.ok(userStore.includes("!['full','scoped'].includes(role)"));
});

test('scoped user permissions are default deny and distinguish view from edit',()=>{
  const authz=src('api','_lib','authorization.js');
  assert.ok(authz.includes("if(user.role_level==='full')return 'edit'"));
  assert.ok(authz.includes("required==='edit'?level==='edit':Boolean(level)"));
  assert.ok(authz.includes("'FEATURE_ACCESS_DENIED'"));
  assert.ok(authz.includes("user.permissions||[]"))
});

test('central router maps business modules to feature permissions',()=>{
  const router=src('api','router.js');
  for(const feature of [
    'employees','deadlines','accidents','complaints','near_misses','credentials_documents',
    'vehicles','safety_analysis','work_import','assets_training','handoffs','audit_logs','user_admin'
  ])assert.ok(router.includes("'"+feature+"'"),feature);
  assert.ok(router.includes('enforceFeatureAccess'));
  assert.ok(router.includes("return ['GET','HEAD','OPTIONS'].includes(method)?'view':'edit'"));
  assert.ok(router.includes("download-ticket(?:\\/|$)/.test(path))return 'view'"))
});

test('production schema persists one permission per user-feature and readiness requires table',()=>{
  const schema=src('docs','production-schema.sql');
  const db=src('api','_lib','db.js');
  assert.ok(schema.includes('create table user_feature_permissions'));
  assert.ok(schema.includes("access_level text not null check (access_level in ('view','edit'))"));
  assert.ok(schema.includes('unique (user_id, feature)'));
  assert.ok(db.includes("to_regclass('public.user_feature_permissions')"));
  assert.ok(db.includes('x.user_feature_permissions_ready'))
});

test('session and me endpoint carry feature permissions',()=>{
  const store=src('api','_lib','auth-store.js');
  const auth=src('api','_lib','auth.js');
  const me=src('api','v1','me.js');
  assert.ok(store.includes('from user_feature_permissions'));
  assert.ok(auth.includes('permissions:session.permissions||[]'));
  assert.ok(me.includes('permissions:user.permissions||[]'))
});

test('production UI uses permission presets and hides unavailable modules',()=>{
  const ui=src('production-app.js');
  assert.ok(ui.includes('PERMISSION_PRESETS'));
  assert.ok(ui.includes("viewer:"));
  assert.ok(ui.includes("manager:"));
  assert.ok(ui.includes("safety:"));
  assert.ok(ui.includes("button.hidden=!canViewAny(NAV_FEATURES[button.dataset.view]||[])"));
  assert.ok(ui.includes("work:['deadlines','credentials_documents','work_import']"));
  assert.ok(ui.includes("safety:['accidents','complaints','near_misses','employees','handoffs']"));
  assert.ok(ui.includes("canEdit('accidents')"));
  assert.ok(ui.includes("canEdit('complaints')"));
  assert.ok(ui.includes("canEdit('near_misses')"));
  assert.ok(ui.includes("canEdit('credentials_documents')"));
  assert.ok(ui.includes("canEdit('work_import')"))
});

test('password reset cannot be issued or completed for suspended/retired users',()=>{
  const users=src('api','_lib','user-store.js');
  assert.ok(users.includes("'USER_NOT_ACTIVE'"));
  assert.ok(users.includes("u.state='active'"));
  assert.ok(users.includes("e.lifecycle_status<>'retired'"))
});


test('common authentication rejects legacy self sessions plus suspended and retired identities',()=>{
  const auth=src('api','_lib','auth.js');
  assert.ok(auth.includes("session.state!=='active'"));
  assert.ok(auth.includes("session.employee_lifecycle_status==='retired'"));
  assert.ok(auth.includes("session.role_level==='self'"));
  assert.ok(auth.includes("throw new AuthError(401,'INVALID_SESSION'"))
});


test('selected-user model retires notices confirmations and applications but keeps handoffs',()=>{
  const router=src('api','router.js');
  const authz=src('api','_lib','authorization.js');
  const users=src('api','_lib','user-store.js');
  assert.ok(router.includes("return /^\\/(?:notices|confirmations|applications)"));
  assert.ok(router.includes("return 'handoffs'"));
  assert.ok(authz.includes("'handoffs'"));
  assert.ok(users.includes("'handoffs'"));
  assert.equal(authz.includes("'notices_workflow'"),false);
  assert.equal(users.includes("'notices_workflow'"),false)
});


test('production permission presets use manager handoffs instead of retired notices workflow',()=>{
  const ui=src('production-app.js');
  assert.ok(ui.includes("['handoffs','引継ぎ']"));
  assert.ok(ui.includes("{feature:'handoffs',access_level:'edit'}"));
  assert.equal(ui.includes('notices_workflow'),false)
});
