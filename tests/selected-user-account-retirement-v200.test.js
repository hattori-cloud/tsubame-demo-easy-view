const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sql=fs.readFileSync(path.join(__dirname,'..','docs','production-selected-user-account-retirement-v200.sql'),'utf8');

test('legacy self accounts are preserved as suspended scoped identities with no operational access',()=>{
  assert.ok(sql.includes("where role_level='self'"));
  assert.ok(sql.includes("role_level='scoped'"));
  assert.ok(sql.includes("state='suspended'"));
  assert.ok(sql.includes('delete from public.user_scopes'));
  assert.ok(sql.includes('delete from public.user_feature_permissions'));
  assert.ok(sql.includes("revoke_reason=coalesce(revoke_reason,'legacy_self_role_retired')"));
  assert.ok(sql.includes("'旧self利用者停止'"));
});

test('selected-user account migration locks canonical role and MFA constraints',()=>{
  assert.ok(sql.includes("check (role_level in ('full','scoped'))"));
  assert.ok(sql.includes('check (mfa_required=true)'));
  assert.equal(sql.includes("delete from public.users"),false);
});
