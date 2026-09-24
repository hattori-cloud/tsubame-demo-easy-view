const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const health=fs.readFileSync(path.join(__dirname,'..','api','v1','health.js'),'utf8');

test('screen and API declare the same v200 release',()=>{
  assert.match(html,/<title>[^<]*v200<\/title>/i);
  assert.match(html,/const RELEASE_VERSION='v200'/);
  assert.match(health,/release:'v200'/);
});

test('v200 health endpoint remains fail-closed for business data',()=>{
  assert.match(health,/business_api_enabled:false/);
  assert.match(health,/data_mode:'no-business-data'/);
  assert.match(health,/feature_set:'v200-fail-closed-staging-backend'/);
});
