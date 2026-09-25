const {authenticateRequest,sendApiError}=require('../../_lib/auth');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {parseIfMatchHeader,setVersionEtag}=require('../../_lib/concurrency');
const {getDraft,saveDraft,deleteDraft}=require('../../_lib/workflow-store');
module.exports=async function handler(req,res){
  try{
    const identity=await authenticateRequest(req),user=resolveCurrentUser(identity),kind=String(req.query.kind||''),rid=requestId(req);
    if(req.method==='GET'){const draft=await getDraft(user,kind);if(!draft){const e=new Error('下書きが見つかりません');e.status=404;e.code='NOT_FOUND';throw e}applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);setVersionEtag(res,draft.version);return res.status(200).json({draft})}
    if(req.method==='PUT'){const expected=req.headers['if-match']?parseIfMatchHeader(req.headers['if-match']):null;const draft=await saveDraft({user,kind,payload:req.body?.payload??req.body??{},expectedVersion:expected});applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);setVersionEtag(res,draft.version);return res.status(200).json({draft})}
    if(req.method==='DELETE'){const deleted=await deleteDraft({user,kind});applySecurityHeaders(res);res.setHeader('X-Request-Id',rid);return res.status(deleted?200:404).json({deleted})}
    res.setHeader('Allow','GET, PUT, DELETE');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'GET・PUT・DELETEのみ利用できます'})
  }catch(err){return sendApiError(req,res,err)}
};