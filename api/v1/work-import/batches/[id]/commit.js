const {authenticateRequest,sendApiError}=require('../../../../../_lib/auth');
const {resolveCurrentUser}=require('../../../../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../../../../_lib/security');
const {parseIfMatchHeader,setVersionEtag}=require('../../../../../_lib/concurrency');
const {commitWorkImport}=require('../../../../../_lib/work-import-store');

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),rid=requestId(req);
    const result=await commitWorkImport({
      user,batchId:String(req.query.id||''),expectedVersion:parseIfMatchHeader(req.headers['if-match']),requestId:rid
    });
    applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);setVersionEtag(res,result.batch.version);
    return res.status(200).json(result)
  }catch(err){return sendApiError(req,res,err)}
};
