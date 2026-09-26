'use strict';

const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser,requireFeaturePermission}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {listHandoffTargets}=require('../../_lib/workflow-store');

module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    requireFeaturePermission(user,'handoffs','edit');
    const employeeId=String(req.query.employee_id||'').trim();
    if(!employeeId){const e=new Error('対象社員を指定してください');e.status=422;e.code='EMPLOYEE_REQUIRED';throw e}
    const targets=await listHandoffTargets(user,employeeId);
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);res.setHeader('Cache-Control','no-store');
    return res.status(200).json({targets})
  }catch(err){return sendApiError(req,res,err)}
};
