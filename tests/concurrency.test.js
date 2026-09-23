const test=require('node:test');
const assert=require('node:assert/strict');

const {
  normalizeVersion,
  formatVersionEtag,
  parseIfMatchHeader,
  requireVersionMatch
}=require('../api/_lib/concurrency');

test('formats strong ETag from non-negative integer version',()=>{
  assert.equal(formatVersionEtag(4),'"4"');
  assert.equal(normalizeVersion('12'),12)
});

test('requires If-Match for writes',()=>{
  assert.throws(
    ()=>parseIfMatchHeader(undefined),
    err=>err.status===428&&err.code==='PRECONDITION_REQUIRED'
  )
});

test('rejects wildcard and weak ETags',()=>{
  assert.throws(()=>parseIfMatchHeader('*'),err=>err.status===400&&err.code==='INVALID_IF_MATCH');
  assert.throws(()=>parseIfMatchHeader('W/"4"'),err=>err.status===400&&err.code==='WEAK_ETAG_NOT_ALLOWED')
});

test('accepts exact strong ETag',()=>{
  assert.equal(parseIfMatchHeader('"7"'),7)
});

test('rejects stale version with conflict',()=>{
  assert.throws(
    ()=>requireVersionMatch({headers:{'if-match':'"3"'}},4),
    err=>err.status===409&&err.code==='VERSION_CONFLICT'
  )
});

test('accepts matching version',()=>{
  assert.equal(requireVersionMatch({headers:{'if-match':'"4"'}},4),4)
});
