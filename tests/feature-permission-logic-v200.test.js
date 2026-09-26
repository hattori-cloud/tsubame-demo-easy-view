const test=require('node:test');
const assert=require('node:assert/strict');

const {
  featureAccessLevel,hasFeaturePermission,requireFeaturePermission
}=require('../api/_lib/authorization');

test('view-only scoped user may read but may not edit that feature',()=>{
  const user={role_level:'scoped',permissions:[{feature:'accidents',access_level:'view'}]};
  assert.equal(featureAccessLevel(user,'accidents'),'view');
  assert.equal(hasFeaturePermission(user,'accidents','view'),true);
  assert.equal(hasFeaturePermission(user,'accidents','edit'),false);
  assert.throws(()=>requireFeaturePermission(user,'accidents','edit'),e=>e?.code==='FEATURE_ACCESS_DENIED')
});

test('scoped feature permissions default deny unrelated modules',()=>{
  const user={role_level:'scoped',permissions:[{feature:'employees',access_level:'edit'}]};
  assert.equal(featureAccessLevel(user,'complaints'),null);
  assert.equal(hasFeaturePermission(user,'complaints','view'),false);
  assert.throws(()=>requireFeaturePermission(user,'complaints','view'),e=>e?.code==='FEATURE_ACCESS_DENIED')
});

test('full administrator receives implicit edit for all declared business features',()=>{
  const user={role_level:'full',permissions:[]};
  for(const feature of ['employees','deadlines','accidents','complaints','near_misses','credentials_documents','vehicles','safety_analysis','work_import','assets_training','handoffs','audit_logs','user_admin']){
    assert.equal(featureAccessLevel(user,feature),'edit',feature);
    assert.equal(hasFeaturePermission(user,feature,'edit'),true,feature)
  }
});

test('unknown feature is denied even to full administrator helper',()=>{
  const user={role_level:'full',permissions:[]};
  assert.equal(featureAccessLevel(user,'future_unregistered_feature'),null);
  assert.equal(hasFeaturePermission(user,'future_unregistered_feature'),false)
});
