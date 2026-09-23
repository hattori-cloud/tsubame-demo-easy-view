const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');

function block(start,end){
  const a=html.indexOf(start),b=html.indexOf(end,a+start.length);
  assert.ok(a>=0,'missing '+start);
  assert.ok(b>a,'missing '+end);
  return html.slice(a,b)
}

test('v200 keeps document rules in transactional core save',()=>{
  assert.ok(html.includes("safeStorageRead('v200DOCUMENT_RULES'"));
  const save=block('function coreSaveItems','const CORE_REVISION_KEY');
  assert.ok(save.includes("['v200DOCUMENT_RULES',DOCUMENT_RULES]"))
});

test('rule table is manager-readable but full-admin editable',()=>{
  const table=block('function openDocumentRuleTable','function openDocumentRuleForm');
  const form=block('function openDocumentRuleForm','function updateDocumentFormGuide');
  assert.ok(table.includes("PREVIEW_ROLE!=='管理者'"));
  assert.ok(table.includes('isFullCompanyAdmin()'));
  assert.ok(form.includes("if(!isFullCompanyAdmin())"));
});

test('retention years are not invented by default',()=>{
  const defs=block('const DEFAULT_DOCUMENT_RULES','let DOCUMENT_RULES=');
  assert.ok(defs.includes("retentionYears:null"));
  assert.ok(defs.includes("retentionNote:'会社決裁待ち'"));
});

test('strict rules must be full-admin and verification-required',()=>{
  const form=block('function openDocumentRuleForm','function updateDocumentFormGuide');
  assert.ok(form.includes("frsecurity.value==='厳格'&&fraccess.value!=='全社管理者のみ'"));
  assert.ok(form.includes("frsecurity.value==='厳格'&&frverify.value!=='required'"));
});

test('new document form applies configured rule defaults',()=>{
  const helper=block('function applyDocumentRuleToForm','function documentRuleVerificationLabel');
  const form=block('function openDocumentForm','function replaceDocument');
  assert.ok(helper.includes('documentRule(catEl.value)'));
  assert.ok(helper.includes('documentRetentionDate'));
  assert.ok(form.includes('let initialRule=documentRule(fdcat.value)'));
});

test('optional-verification documents are excluded from pending verification queue',()=>{
  const verify=block('function documentRuleVerificationLabel','function openDocumentRuleTable');
  const center=block('function openOriginalDocumentCenter','function setOriginalDocumentState');
  assert.ok(verify.includes('function documentVerificationRequired'));
  assert.ok(center.includes('documentVerificationRequired(d)'));
});

test('strict document categories cannot be registered by scoped admins',()=>{
  const form=block('function openDocumentForm','function replaceDocument');
  assert.ok(form.includes("documentRule(o.value).securityClass==='厳格'"));
  assert.ok(form.includes("documentRule(fdcat.value).securityClass==='厳格'&&!isFullCompanyAdmin()"));
});

test('verification requirement is snapshotted per document',()=>{
  const migration=block('function ensureCredentialLinks','function qualificationEvidenceDocument');
  const helper=block('function documentRuleVerificationLabel','function openDocumentRuleTable');
  const form=block('function openDocumentForm','function replaceDocument');
  assert.ok(migration.includes('verificationRequired'));
  assert.ok(helper.includes("d?.verificationRequired!==undefined"));
  assert.ok(form.includes('verificationRequired:d?.verificationRequired!==undefined'));
});

