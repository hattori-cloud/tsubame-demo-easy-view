const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sql=fs.readFileSync(path.join(__dirname,'..','docs','production-selected-user-workflow-v200.sql'),'utf8');
const schema=fs.readFileSync(path.join(__dirname,'..','docs','production-schema.sql'),'utf8');

test('selected-user workflow migration preserves old workflow access as handoff access',()=>{
  assert.ok(sql.includes("select user_id,'handoffs',access_level"));
  assert.ok(sql.includes("where feature='notices_workflow'"));
  assert.ok(sql.includes("when public.user_feature_permissions.access_level='edit' or excluded.access_level='edit' then 'edit'"));
  assert.ok(sql.includes("delete from public.user_feature_permissions where feature='notices_workflow'"))
});

test('canonical feature constraint contains handoffs and no retired notices workflow permission',()=>{
  const featureSection=schema.slice(schema.indexOf('create table user_feature_permissions'),schema.indexOf('create table auth_sessions'));
  assert.ok(featureSection.includes("'handoffs'"));
  assert.equal(featureSection.includes("'notices_workflow'"),false);
  assert.ok(sql.includes("'handoffs'"))
});
