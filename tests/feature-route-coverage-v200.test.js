const test=require('node:test');
const assert=require('node:assert/strict');
const path=require('node:path');

const router=require('../api/router');

function sourceFeature(source){
  const s=String(source||'').replace(/^api\/v1\//,'');
  if(/^employees\/\[id\]\/credentials/.test(s)||/^qualifications\//.test(s)||/^documents\//.test(s)||s==='documents/index.js')return 'credentials_documents';
  if(/^employees\//.test(s)||s==='employees/index.js'||/^guidance\//.test(s)||s==='guidance/index.js')return 'employees';
  if(/^deadlines\//.test(s))return 'deadlines';
  if(/^accidents\//.test(s))return 'accidents';
  if(s==='drafts/index.js')return 'drafts_multi';
  if(/^drafts\/\[kind\]/.test(s))return 'draft_by_kind';
  if(/^complaints\//.test(s))return 'complaints';
  if(/^near-misses\//.test(s)||/^near-miss-compliance\//.test(s))return 'near_misses';
  if(/^vehicles\//.test(s))return 'vehicles';
  if(/^analysis\//.test(s))return 'safety_analysis';
  if(/^work-import\//.test(s))return 'work_import';
  if(/^assets\//.test(s)||/^training\//.test(s))return 'assets_training';
  if(/^notices\//.test(s)||/^confirmations\//.test(s)||/^handoffs\//.test(s)||/^applications\//.test(s))return 'notices_workflow';
  if(/^audit-logs\//.test(s))return 'audit_logs';
  if(/^users\//.test(s))return 'user_admin';
  if(/^auth\//.test(s)||s==='health.js'||s==='me.js'||s==='secure-probe.js'||s==='staging-readiness.js')return 'exempt';
  return null
}

test('every deployed business route belongs to an explicit feature or approved auth/system exemption',()=>{
  const unknown=router.ROUTES.map(r=>r.source).filter(src=>sourceFeature(src)===null);
  assert.deepEqual(unknown,[])
});

test('central path classifier covers representative paths for every feature',()=>{
  const cases={
    '/employees':'employees',
    '/employees/e1':'employees',
    '/employees/e1/credentials':'credentials_documents',
    '/documents/d1':'credentials_documents',
    '/deadlines':'deadlines',
    '/accidents/a1':'accidents',
    '/complaints/c1':'complaints',
    '/near-misses/n1':'near_misses',
    '/near-miss-compliance':'near_misses',
    '/vehicles/v1':'vehicles',
    '/analysis/safety-summary':'safety_analysis',
    '/work-import/preflight':'work_import',
    '/assets/a1':'assets_training',
    '/training/t1':'assets_training',
    '/notices':'notices_workflow',
    '/confirmations/c1':'notices_workflow',
    '/handoffs/h1':'notices_workflow',
    '/applications/a1':'notices_workflow',
    '/audit-logs':'audit_logs',
    '/users/u1/access':'user_admin'
  };
  for(const [p,expected] of Object.entries(cases))assert.equal(router.featureForPath(p),expected,p)
});

test('GET is view and business mutation is edit except explicit view interactions',()=>{
  assert.equal(router.requiredFeatureAccess({method:'GET'},'/accidents/a1'),'view');
  assert.equal(router.requiredFeatureAccess({method:'PATCH'},'/accidents/a1'),'edit');
  assert.equal(router.requiredFeatureAccess({method:'POST'},'/documents/d1/download-ticket'),'view');
  assert.equal(router.requiredFeatureAccess({method:'POST'},'/notices/n1/read'),'view')
});


test('mixed draft listing is explicitly filtered by permitted draft kinds',()=>{
  const routerSource=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','api','router.js'),'utf8');
  const draftSource=require('node:fs').readFileSync(require('node:path').join(__dirname,'..','api','v1','drafts','index.js'),'utf8');
  assert.ok(routerSource.includes('allowedDraftKinds'));
  assert.ok(routerSource.includes('_tsubameAllowedDraftKinds'));
  assert.ok(draftSource.includes("drafts.filter(d=>allowed.includes(d.kind))"));
});
