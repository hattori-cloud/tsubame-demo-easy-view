const {authenticateRequest,sendApiError}=require('../_lib/auth');
const {applySecurityHeaders,requestId}=require('../_lib/security');

module.exports=async function handler(req,res){
  if(req.method!=='GET'){
    res.setHeader('Allow','GET');
    return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETのみ利用できます'})
  }
  try{
    const identity=await authenticateRequest(req);
    const id=requestId(req);
    applySecurityHeaders(res);
    res.setHeader('X-Request-Id',id);
    return res.status(200).json({
      authenticated:true,
      mfa_verified:Boolean(identity.mfa),
      business_data_returned:false,
      data_mode:'no-business-data',
      release:'v200'
    })
  }catch(err){
    return sendApiError(req,res,err)
  }
};
