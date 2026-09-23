const crypto=require('crypto');
const ExcelJS=require('@ayocore/exceljs');
const {authenticateRequest,sendApiError,AuthError}=require('../../../_lib/auth');
const {applySecurityHeaders,requestId}=require('../../../_lib/security');
const {resolveCurrentUser}=require('../../../_lib/authorization');

const MAX_FILE_BYTES=8*1024*1024;
const FIELD_ALIASES={
  employee_no:['社員番号','社員コード','社員no','社員ｎｏ','従業員番号','従業員コード'],
  month:['対象月','年月','計上月','勤務月'],
  restraint:['拘束時間','総拘束時間','拘束'],
  remaining:['残時間','残り時間','残時間数','残り'],
  overtime:['残業時間','残業','時間外','時間外労働'],
  last_posted:['最終計上日','計上日','最終更新日','更新日']
};
function normalizeHeader(v){
  return String(v??'').trim().toLowerCase().replace(/[\s　_\-／/()（）:：]/g,'')
}
function headerMap(values){
  const normalized=values.map(normalizeHeader),map={};
  Object.entries(FIELD_ALIASES).forEach(([field,aliases])=>{
    const set=aliases.map(normalizeHeader);
    const idx=normalized.findIndex(x=>set.includes(x));
    if(idx>=0)map[field]=idx+1
  });
  return map
}
function cellValue(cell){
  const v=cell?.value;
  if(v instanceof Date)return v.toISOString().slice(0,10);
  if(v&&typeof v==='object'){
    if(v.result!==undefined)return v.result;
    if(v.text!==undefined)return v.text;
    if(Array.isArray(v.richText))return v.richText.map(x=>x.text||'').join('')
  }
  return v??''
}
function numberValue(v){
  if(typeof v==='number'&&Number.isFinite(v))return v;
  const n=Number(String(v??'').replace(/,/g,'').replace(/時間/g,'').trim());
  return Number.isFinite(n)?n:null
}
function dateValue(v){
  if(v instanceof Date)return v.toISOString().slice(0,10);
  const s=String(v??'').trim();
  if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(s)){
    const [y,m,d]=s.split('-').map(Number);
    return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0')
  }
  if(/^\d{4}[/.]\d{1,2}[/.]\d{1,2}$/.test(s)){
    const [y,m,d]=s.split(/[/.]/).map(Number);
    return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0')
  }
  return s
}
function sheetCandidate(sheet){
  const max=Math.min(sheet.rowCount||0,20);
  let best=null;
  for(let r=1;r<=max;r++){
    const row=sheet.getRow(r),values=[];
    for(let c=1;c<=Math.min(row.cellCount||20,40);c++)values.push(cellValue(row.getCell(c)));
    const map=headerMap(values),score=Object.keys(map).length;
    if(!best||score>best.score)best={row:r,map,score,headers:values.map(String)}
  }
  return best||{row:1,map:{},score:0,headers:[]}
}
module.exports=async function handler(req,res){
  if(req.method!=='POST'){
    res.setHeader('Allow','POST');
    return sendApiError(req,res,{status:405,code:'METHOD_NOT_ALLOWED',message:'POSTのみ利用できます'})
  }
  try{
    const identity=await authenticateRequest(req);
    const user=resolveCurrentUser(identity);
    if(user.role_level!=='full')throw new AuthError(403,'FULL_ADMIN_REQUIRED','勤務集計の取込前チェックは全社管理者のみ利用できます');
    const fileName=String(req.body?.file_name||'').trim();
    const fileBase64=String(req.body?.file_base64||'');
    if(!/\.xlsx$/i.test(fileName))throw new AuthError(422,'XLSX_REQUIRED','.xlsx形式のみ対応しています');
    let buffer;
    try{buffer=Buffer.from(fileBase64,'base64')}catch(_){throw new AuthError(400,'INVALID_FILE','ファイルを読み込めません')}
    if(!buffer.length)throw new AuthError(400,'EMPTY_FILE','ファイルが空です');
    if(buffer.length>MAX_FILE_BYTES)throw new AuthError(413,'FILE_TOO_LARGE','ファイルサイズは8MB以下にしてください');

    const workbook=new ExcelJS.Workbook();
    try{await workbook.xlsx.load(buffer)}catch(_){throw new AuthError(422,'INVALID_XLSX','Excelファイルを解析できません')}

    let chosen=null;
    workbook.worksheets.forEach(sheet=>{
      const candidate=sheetCandidate(sheet);
      if(!chosen||candidate.score>chosen.score)chosen={sheet,candidate,...candidate}
    });
    if(!chosen)throw new AuthError(422,'NO_WORKSHEET','ワークシートが見つかりません');

    const required=['employee_no','restraint','remaining','overtime','last_posted'];
    const missing=required.filter(k=>!chosen.map[k]);
    const rows=[],issues=[];
    const start=chosen.row+1,end=Math.min(chosen.sheet.rowCount||start-1,start+4999);
    for(let r=start;r<=end;r++){
      const row=chosen.sheet.getRow(r);
      const employeeNo=chosen.map.employee_no?String(cellValue(row.getCell(chosen.map.employee_no))).trim():'';
      if(!employeeNo)continue;
      const item={
        row:r,
        employee_no:employeeNo,
        month:chosen.map.month?String(cellValue(row.getCell(chosen.map.month))).trim():'',
        restraint:chosen.map.restraint?numberValue(cellValue(row.getCell(chosen.map.restraint))):null,
        remaining:chosen.map.remaining?numberValue(cellValue(row.getCell(chosen.map.remaining))):null,
        overtime:chosen.map.overtime?numberValue(cellValue(row.getCell(chosen.map.overtime))):null,
        last_posted:chosen.map.last_posted?dateValue(cellValue(row.getCell(chosen.map.last_posted))):''
      };
      const rowIssues=[];
      ['restraint','remaining','overtime'].forEach(k=>{if(chosen.map[k]&&item[k]===null)rowIssues.push(k+'が数値ではありません')});
      if(chosen.map.last_posted&&!/^\d{4}-\d{2}-\d{2}$/.test(item.last_posted))rowIssues.push('最終計上日の形式を確認してください');
      if(item.overtime!==null&&item.overtime>=60)rowIssues.push('残業60時間以上');
      if(rowIssues.length)issues.push({row:r,employee_no:employeeNo,issues:rowIssues});
      rows.push(item)
    }

    const id=requestId(req);applySecurityHeaders(res);res.setHeader('X-Request-Id',id);
    return res.status(200).json({
      preflight:{
        file_name:fileName,
        sha256:crypto.createHash('sha256').update(buffer).digest('hex'),
        size:buffer.length,
        sheet:chosen.sheet.name,
        header_row:chosen.row,
        detected_fields:Object.keys(chosen.map),
        missing_fields:missing,
        row_count:rows.length,
        warning_count:issues.length,
        overtime_60_count:rows.filter(x=>Number(x.overtime)>=60).length,
        preview:rows.slice(0,20),
        issues:issues.slice(0,50)
      },
      persistence:'none',
      data_mode:'preflight-only'
    })
  }catch(err){
    return sendApiError(req,res,err)
  }
};
