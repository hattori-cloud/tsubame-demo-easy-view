const {applySecurityHeaders,requestId,productionAuthConfigured}=require('../_lib/security');

module.exports=function handler(req,res){
  const id=requestId(req);
  applySecurityHeaders(res);
  res.setHeader('X-Request-Id',id);
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return res.status(405).json({error:{code:'METHOD_NOT_ALLOWED',message:'GETのみ利用できます',request_id:id}});
  }
  return res.status(200).json({
    service:'tsubame-employee-management-api',
    release:'v118',
    status:'ok',
    data_mode:'no-business-data',
    production_auth_configured:productionAuthConfigured(),
    business_api_enabled:false,
    feature_set:'production-style-employee-list',
    timestamp:new Date().toISOString()
  });
};
