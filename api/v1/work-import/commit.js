const {authenticateRequest,sendApiError,AuthError}=require('../../_lib/auth');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {resolveCurrentUser}=require('../../_lib/authorization');
const {commitWorkImport}=require('../../_lib/work-import-store');
const {parseWorkbookBuffer}=require('./preflight')._test;

function requestBuffer(req){
  if(Buffer.isBuffer(req.body))return req.body;
  if(typeof req.body==='string')return Buffer.from(req.body,'binary');
  if(req.body?.file_base64)return Buffer.from(String(req.body.file_base64),'base64');
  throw new AuthError(400,'INVALID_FILE','Excelファイル本体を読み込めません')
}

module.exports=async function handler(req,res){
  if(req.method!=='POST'){res.setHeader('Allow','POST');return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})}
  try{
    const identity=await authenticateRequest(req);
    const user=resolveCurrentUser(identity);
    if(user.role_level!=='full')throw new AuthError(403,'FULL_ADMIN_REQUIRED','勤務集計の取込は全社管理者のみ利用できます');
    const fileName=String(req.headers['x-file-name']||req.query?.file_name||'').trim();
    const expectedSha=String(req.headers['x-preflight-sha256']||req.body?.expected_sha256||'').trim().toLowerCase();
    if(!/^[0-9a-f]{64}$/.test(expectedSha))throw new AuthError(422,'PREFLIGHT_HASH_REQUIRED','前チェックで確認したSHA-256が必要です');
    const parsed=await parseWorkbookBuffer(requestBuffer(req),fileName,{includeRows:true});
    if(parsed.sha256!==expectedSha)throw new AuthError(409,'PREFLIGHT_FILE_CHANGED','前チェック後にファイル内容が変わっています。もう一度前チェックしてください');
    if(!parsed.can_commit)throw new AuthError(422,'PREFLIGHT_BLOCKED','前チェックのエラーを解消してから取込してください');
    const id=requestId(req);
    const batch=await commitWorkImport({user,fileName:parsed.file_name,sha256:parsed.sha256,rows:parsed.rows,requestId:id});
    applySecurityHeaders(res);res.setHeader('X-Request-Id',id);
    return res.status(201).json({batch,source:{file_name:parsed.file_name,sha256:parsed.sha256,row_count:parsed.row_count}})
  }catch(err){return sendApiError(req,res,err)}
};
