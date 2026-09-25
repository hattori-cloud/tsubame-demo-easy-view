const {authenticateRequest,sendApiError}=require('../../../_lib/auth');
const {resolveCurrentUser}=require('../../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../../_lib/security');
const {setVersionEtag}=require('../../../_lib/concurrency');
const {getWorkImportBatch}=require('../../../_lib/work-import-store');

module.exports=async function handler(req,res){
  if(req.method!=='GET'){res.setHeader('Allow','GET');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GETのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    const data=await getWorkImportBatch({user,batchId:String(req.query.id||'')});
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);setVersionEtag(res,data.batch.version);
    return res.status(200).json(data)
  }catch(err){return sendApiError(req,res,err)}
};
