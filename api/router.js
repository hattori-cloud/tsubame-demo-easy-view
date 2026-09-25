'use strict';

const {applySecurityHeaders,requestId,errorBody}=require('./_lib/security');
const {isProductionRuntime,productionBusinessDataEnabled}=require('./_lib/runtime-config');
const {probeDatabaseReadiness}=require('./_lib/db');

// Vercel Hobby function-budget router: keep all v1 handlers as internal modules,
// but deploy only this single Node function. Route params are restored onto req.query.
const ROUTES=[
  {pattern:/^\/auth\/mfa\/enroll\/complete\/?$/,keys:[],handler:require("./v1/auth/mfa/enroll/complete.js"),source:"api/v1/auth/mfa/enroll/complete.js"},
  {pattern:/^\/auth\/mfa\/enroll\/start\/?$/,keys:[],handler:require("./v1/auth/mfa/enroll/start.js"),source:"api/v1/auth/mfa/enroll/start.js"},
  {pattern:/^\/auth\/password\/reset\/complete\/?$/,keys:[],handler:require("./v1/auth/password/reset/complete.js"),source:"api/v1/auth/password/reset/complete.js"},
  {pattern:/^\/auth\/mfa\/verify\/?$/,keys:[],handler:require("./v1/auth/mfa/verify.js"),source:"api/v1/auth/mfa/verify.js"},
  {pattern:/^\/auth\/password\/change\/?$/,keys:[],handler:require("./v1/auth/password/change.js"),source:"api/v1/auth/password/change.js"},
  {pattern:/^\/auth\/password\/reset\/?$/,keys:[],handler:require("./v1/auth/password/reset.js"),source:"api/v1/auth/password/reset.js"},
  {pattern:/^\/accidents\/([^\/]+)\/archive\/?$/,keys:["id"],handler:require("./v1/accidents/[id]/archive.js"),source:"api/v1/accidents/[id]/archive.js"},
  {pattern:/^\/accidents\/([^\/]+)\/complete\/?$/,keys:["id"],handler:require("./v1/accidents/[id]/complete.js"),source:"api/v1/accidents/[id]/complete.js"},
  {pattern:/^\/accidents\/([^\/]+)\/reopen\/?$/,keys:["id"],handler:require("./v1/accidents/[id]/reopen.js"),source:"api/v1/accidents/[id]/reopen.js"},
  {pattern:/^\/complaints\/([^\/]+)\/archive\/?$/,keys:["id"],handler:require("./v1/complaints/[id]/archive.js"),source:"api/v1/complaints/[id]/archive.js"},
  {pattern:/^\/complaints\/([^\/]+)\/complete\/?$/,keys:["id"],handler:require("./v1/complaints/[id]/complete.js"),source:"api/v1/complaints/[id]/complete.js"},
  {pattern:/^\/complaints\/([^\/]+)\/reopen\/?$/,keys:["id"],handler:require("./v1/complaints/[id]/reopen.js"),source:"api/v1/complaints/[id]/reopen.js"},
  {pattern:/^\/confirmations\/([^\/]+)\/respond\/?$/,keys:["id"],handler:require("./v1/confirmations/[id]/respond.js"),source:"api/v1/confirmations/[id]/respond.js"},
  {pattern:/^\/documents\/([^\/]+)\/download-ticket\/?$/,keys:["id"],handler:require("./v1/documents/[id]/download-ticket.js"),source:"api/v1/documents/[id]/download-ticket.js"},
  {pattern:/^\/employees\/([^\/]+)\/credentials\/?$/,keys:["id"],handler:require("./v1/employees/[id]/credentials.js"),source:"api/v1/employees/[id]/credentials.js"},
  {pattern:/^\/employees\/([^\/]+)\/employee-number\/?$/,keys:["id"],handler:require("./v1/employees/[id]/employee-number.js"),source:"api/v1/employees/[id]/employee-number.js"},
  {pattern:/^\/employees\/([^\/]+)\/transition\/?$/,keys:["id"],handler:require("./v1/employees/[id]/transition.js"),source:"api/v1/employees/[id]/transition.js"},
  {pattern:/^\/handoffs\/([^\/]+)\/acknowledge\/?$/,keys:["id"],handler:require("./v1/handoffs/[id]/acknowledge.js"),source:"api/v1/handoffs/[id]/acknowledge.js"},
  {pattern:/^\/near-miss-compliance\/targets\/([^\/]+)\/?$/,keys:["id"],handler:require("./v1/near-miss-compliance/targets/[id].js"),source:"api/v1/near-miss-compliance/targets/[id].js"},
  {pattern:/^\/near-misses\/([^\/]+)\/archive\/?$/,keys:["id"],handler:require("./v1/near-misses/[id]/archive.js"),source:"api/v1/near-misses/[id]/archive.js"},
  {pattern:/^\/notices\/([^\/]+)\/read\/?$/,keys:["id"],handler:require("./v1/notices/[id]/read.js"),source:"api/v1/notices/[id]/read.js"},
  {pattern:/^\/users\/([^\/]+)\/access\/?$/,keys:["id"],handler:require("./v1/users/[id]/access.js"),source:"api/v1/users/[id]/access.js"},
  {pattern:/^\/users\/([^\/]+)\/reactivate\/?$/,keys:["id"],handler:require("./v1/users/[id]/reactivate.js"),source:"api/v1/users/[id]/reactivate.js"},
  {pattern:/^\/users\/([^\/]+)\/suspend\/?$/,keys:["id"],handler:require("./v1/users/[id]/suspend.js"),source:"api/v1/users/[id]/suspend.js"},
  {pattern:/^\/vehicles\/([^\/]+)\/assignments\/?$/,keys:["id"],handler:require("./v1/vehicles/[id]/assignments.js"),source:"api/v1/vehicles/[id]/assignments.js"},
  {pattern:/^\/analysis\/safety-summary\/?$/,keys:[],handler:require("./v1/analysis/safety-summary.js"),source:"api/v1/analysis/safety-summary.js"},
  {pattern:/^\/auth\/login\/?$/,keys:[],handler:require("./v1/auth/login.js"),source:"api/v1/auth/login.js"},
  {pattern:/^\/auth\/logout\/?$/,keys:[],handler:require("./v1/auth/logout.js"),source:"api/v1/auth/logout.js"},
  {pattern:/^\/documents\/finalize\/?$/,keys:[],handler:require("./v1/documents/finalize.js"),source:"api/v1/documents/finalize.js"},
  {pattern:/^\/documents\/upload-ticket\/?$/,keys:[],handler:require("./v1/documents/upload-ticket.js"),source:"api/v1/documents/upload-ticket.js"},
  {pattern:/^\/near-miss-compliance\/snapshot\/?$/,keys:[],handler:require("./v1/near-miss-compliance/snapshot.js"),source:"api/v1/near-miss-compliance/snapshot.js"},
  {pattern:/^\/near-miss-compliance\/targets\/?$/,keys:[],handler:require("./v1/near-miss-compliance/targets/index.js"),source:"api/v1/near-miss-compliance/targets/index.js"},
  {pattern:/^\/work-import\/batches\/([^\/]+)\/commit\/?$/,keys:["id"],handler:require("./v1/work-import/batches/[id]/commit.js"),source:"api/v1/work-import/batches/[id]/commit.js"},
  {pattern:/^\/work-import\/batches\/([^\/]+)\/rollback\/?$/,keys:["id"],handler:require("./v1/work-import/batches/[id]/rollback.js"),source:"api/v1/work-import/batches/[id]/rollback.js"},
  {pattern:/^\/work-import\/batches\/([^\/]+)\/?$/,keys:["id"],handler:require("./v1/work-import/batches/[id].js"),source:"api/v1/work-import/batches/[id].js"},
  {pattern:/^\/work-import\/preflight\/?$/,keys:[],handler:require("./v1/work-import/preflight.js"),source:"api/v1/work-import/preflight.js"},
  {pattern:/^\/accidents\/([^\/]+)\/?$/,keys:["id"],handler:require("./v1/accidents/[id].js"),source:"api/v1/accidents/[id].js"},
  {pattern:/^\/applications\/([^\/]+)\/?$/,keys:["id"],handler:require("./v1/applications/[id].js"),source:"api/v1/applications/[id].js"},
  {pattern:/^\/assets\/([^\/]+)\/?$/,keys:["id"],handler:require("./v1/assets/[id].js"),source:"api/v1/assets/[id].js"},
  {pattern:/^\/complaints\/([^\/]+)\/?$/,keys:["id"],handler:require("./v1/complaints/[id].js"),source:"api/v1/complaints/[id].js"},
  {pattern:/^\/confirmations\/([^\/]+)\/?$/,keys:["id"],handler:require("./v1/confirmations/[id].js"),source:"api/v1/confirmations/[id].js"},
  {pattern:/^\/documents\/([^\/]+)\/?$/,keys:["id"],handler:require("./v1/documents/[id].js"),source:"api/v1/documents/[id].js"},
  {pattern:/^\/drafts\/([^\/]+)\/?$/,keys:["kind"],handler:require("./v1/drafts/[kind].js"),source:"api/v1/drafts/[kind].js"},
  {pattern:/^\/employees\/([^\/]+)\/?$/,keys:["id"],handler:require("./v1/employees/[id].js"),source:"api/v1/employees/[id].js"},
  {pattern:/^\/guidance\/([^\/]+)\/?$/,keys:["id"],handler:require("./v1/guidance/[id].js"),source:"api/v1/guidance/[id].js"},
  {pattern:/^\/near-misses\/([^\/]+)\/?$/,keys:["id"],handler:require("./v1/near-misses/[id].js"),source:"api/v1/near-misses/[id].js"},
  {pattern:/^\/notices\/([^\/]+)\/?$/,keys:["id"],handler:require("./v1/notices/[id].js"),source:"api/v1/notices/[id].js"},
  {pattern:/^\/qualifications\/([^\/]+)\/?$/,keys:["id"],handler:require("./v1/qualifications/[id].js"),source:"api/v1/qualifications/[id].js"},
  {pattern:/^\/training\/([^\/]+)\/?$/,keys:["id"],handler:require("./v1/training/[id].js"),source:"api/v1/training/[id].js"},
  {pattern:/^\/vehicles\/([^\/]+)\/?$/,keys:["id"],handler:require("./v1/vehicles/[id].js"),source:"api/v1/vehicles/[id].js"},
  {pattern:/^\/accidents\/?$/,keys:[],handler:require("./v1/accidents/index.js"),source:"api/v1/accidents/index.js"},
  {pattern:/^\/applications\/?$/,keys:[],handler:require("./v1/applications/index.js"),source:"api/v1/applications/index.js"},
  {pattern:/^\/assets\/?$/,keys:[],handler:require("./v1/assets/index.js"),source:"api/v1/assets/index.js"},
  {pattern:/^\/audit-logs\/?$/,keys:[],handler:require("./v1/audit-logs/index.js"),source:"api/v1/audit-logs/index.js"},
  {pattern:/^\/complaints\/?$/,keys:[],handler:require("./v1/complaints/index.js"),source:"api/v1/complaints/index.js"},
  {pattern:/^\/confirmations\/?$/,keys:[],handler:require("./v1/confirmations/index.js"),source:"api/v1/confirmations/index.js"},
  {pattern:/^\/deadlines\/?$/,keys:[],handler:require("./v1/deadlines/index.js"),source:"api/v1/deadlines/index.js"},
  {pattern:/^\/documents\/?$/,keys:[],handler:require("./v1/documents/index.js"),source:"api/v1/documents/index.js"},
  {pattern:/^\/drafts\/?$/,keys:[],handler:require("./v1/drafts/index.js"),source:"api/v1/drafts/index.js"},
  {pattern:/^\/employees\/?$/,keys:[],handler:require("./v1/employees/index.js"),source:"api/v1/employees/index.js"},
  {pattern:/^\/guidance\/?$/,keys:[],handler:require("./v1/guidance/index.js"),source:"api/v1/guidance/index.js"},
  {pattern:/^\/handoffs\/?$/,keys:[],handler:require("./v1/handoffs/index.js"),source:"api/v1/handoffs/index.js"},
  {pattern:/^\/health\/?$/,keys:[],handler:require("./v1/health.js"),source:"api/v1/health.js"},
  {pattern:/^\/me\/?$/,keys:[],handler:require("./v1/me.js"),source:"api/v1/me.js"},
  {pattern:/^\/near-miss-compliance\/?$/,keys:[],handler:require("./v1/near-miss-compliance/index.js"),source:"api/v1/near-miss-compliance/index.js"},
  {pattern:/^\/near-misses\/?$/,keys:[],handler:require("./v1/near-misses/index.js"),source:"api/v1/near-misses/index.js"},
  {pattern:/^\/notices\/?$/,keys:[],handler:require("./v1/notices/index.js"),source:"api/v1/notices/index.js"},
  {pattern:/^\/qualifications\/?$/,keys:[],handler:require("./v1/qualifications/index.js"),source:"api/v1/qualifications/index.js"},
  {pattern:/^\/secure-probe\/?$/,keys:[],handler:require("./v1/secure-probe.js"),source:"api/v1/secure-probe.js"},
  {pattern:/^\/staging-readiness\/?$/,keys:[],handler:require("./v1/staging-readiness.js"),source:"api/v1/staging-readiness.js"},
  {pattern:/^\/training\/?$/,keys:[],handler:require("./v1/training/index.js"),source:"api/v1/training/index.js"},
  {pattern:/^\/users\/?$/,keys:[],handler:require("./v1/users/index.js"),source:"api/v1/users/index.js"},
  {pattern:/^\/vehicles\/?$/,keys:[],handler:require("./v1/vehicles/index.js"),source:"api/v1/vehicles/index.js"},
];

function rawPath(req){
  const q=req&&req.query?req.query.__path:null;
  const value=Array.isArray(q)?q[0]:q;
  if(value!==undefined&&value!==null&&String(value)!=='')return '/'+String(value).replace(/^\/+|\/+$/g,'');
  try{
    const u=new URL(String(req.url||''),'http://localhost');
    return u.pathname.replace(/^\/api\/v1(?=\/|$)/,'')||'/';
  }catch(_){return '/'}
}

module.exports=async function handler(req,res){
  const path=rawPath(req);
  if(isProductionRuntime() && path!=='/health'){
    const id=requestId(req);
    applySecurityHeaders(res);res.setHeader('X-Request-Id',id);res.setHeader('Cache-Control','no-store');
    if(!productionBusinessDataEnabled()){
      return res.status(503).json(errorBody('PRODUCTION_NOT_ACTIVATED','本番業務APIはまだ有効化されていません',id))
    }
    const dbReady=await probeDatabaseReadiness();
    if(!dbReady.connected||!dbReady.core_schema_ready||!dbReady.audit_append_only_ready||!dbReady.capacity_ready||!dbReady.auth_rate_limit_ready){
      return res.status(503).json(errorBody('PRODUCTION_DATABASE_NOT_READY','本番データベースの実接続・スキーマ・監査保護を確認できません',id))
    }
  }
  for(const route of ROUTES){
    const m=route.pattern.exec(path);
    if(!m)continue;
    const query={...(req.query||{})};
    delete query.__path;
    route.keys.forEach((key,i)=>{try{query[key]=decodeURIComponent(m[i+1])}catch(_){query[key]=m[i+1]}});
    req.query=query;
    return route.handler(req,res)
  }
  const id=requestId(req);
  applySecurityHeaders(res);res.setHeader('X-Request-Id',id);
  return res.status(404).json(errorBody('NOT_FOUND','対象データが見つかりません',id))
};

module.exports.ROUTES=ROUTES;
