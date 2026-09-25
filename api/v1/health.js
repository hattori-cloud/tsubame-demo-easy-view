const {applySecurityHeaders,requestId}=require('../_lib/security');
const {backendReadiness}=require('../_lib/runtime-config');

module.exports=function handler(req,res){
  const id=requestId(req);
  applySecurityHeaders(res);
  res.setHeader('X-Request-Id',id);
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:{code:'METHOD_NOT_ALLOWED',message:'GETのみ利用できます',request_id:id}});
  }
  const readiness=backendReadiness();
  return res.status(200).json({
    service:'tsubame-employee-management-api',
    release:'v200',
    status:'ok',
    data_mode:'no-business-data',
    production_auth_configured:readiness.auth_env_present,
    production_business_activation_requested:readiness.production_business_activation_requested,
    business_api_enabled:readiness.production_business_data_enabled,
    feature_set:'v200-fail-closed-staging-backend',
    timestamp:new Date().toISOString()
  });
};
