const crypto=require('crypto');
const ExcelJS=require('@ayocore/exceljs');
const {authenticateRequest,sendApiError,AuthError}=require('../../_lib/auth');
const {applySecurityHeaders,requestId}=require('../../_lib/security');
const {resolveCurrentUser}=require('../../_lib/authorization');

const MAX_FILE_BYTES=4*1024*1024;
const MAX_DATA_ROWS=5000;
const MAX_SCAN_COLUMNS=200;
const SENSITIVE_HEADER_PATTERNS=[
  /マイナンバー|個人番号/i,
  /健康保険.*(番号|記号)|保険番号/i,
  /雇用保険.*番号|基礎年金.*番号|年金番号/i,
  /給与|基本給|賃金|賞与額/i,
  /口座番号|銀行口座/i,
  /診断結果|病名|既往歴|治療内容/i
];
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
  const s=String(v??'').replace(/,/g,'').trim();
  if(!s)return null;
  let m=s.match(/^(\d{1,4}):([0-5]?\d)$/);
  if(m)return Number(m[1])+Number(m[2])/60;
  const cleaned=s.replace(/時間/g,'').trim();
  if(!cleaned)return null;
  const n=Number(cleaned);
  return Number.isFinite(n)?n:null
}
function numberCellValue(cell){
  const raw=cellValue(cell);
  if(typeof raw==='number'&&Number.isFinite(raw)){
    const fmt=String(cell?.numFmt||'').toLowerCase();
    if(/\[h\]|h+:mm|h:mm/.test(fmt))return raw*24
  }
  return numberValue(raw)
}
function validDateParts(y,m,d){
  if(!Number.isInteger(y)||!Number.isInteger(m)||!Number.isInteger(d)||m<1||m>12||d<1||d>31)return false;
  const dt=new Date(Date.UTC(y,m-1,d));
  return dt.getUTCFullYear()===y&&dt.getUTCMonth()===m-1&&dt.getUTCDate()===d
}
function isValidIsoDate(s){
  const m=String(s||'').match(/^(\d{4})-(\d{2})-(\d{2})$/);
  return !!m&&validDateParts(Number(m[1]),Number(m[2]),Number(m[3]))
}
function isValidYearMonth(s){
  const m=String(s||'').match(/^(\d{4})-(\d{2})$/);
  return !!m&&Number(m[2])>=1&&Number(m[2])<=12
}
function dateValue(v){
  if(v instanceof Date)return v.toISOString().slice(0,10);
  const s=String(v??'').trim();
  let parts=null;
  if(/^\d{4}-\d{1,2}-\d{1,2}$/.test(s))parts=s.split('-').map(Number);
  else if(/^\d{4}[/.]\d{1,2}[/.]\d{1,2}$/.test(s))parts=s.split(/[/.]/).map(Number);
  if(parts){
    const [y,m,d]=parts;
    if(validDateParts(y,m,d))return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')+'-'+String(d).padStart(2,'0')
  }
  return s
}
function monthValue(v,lastPosted=''){
  const s=String(v??'').trim();
  if(/^\d{4}[-/]\d{1,2}$/.test(s)){
    const [y,m]=s.replace('/','-').split('-').map(Number);
    if(m>=1&&m<=12)return String(y).padStart(4,'0')+'-'+String(m).padStart(2,'0')
    return s
  }
  return isValidIsoDate(lastPosted)?lastPosted.slice(0,7):s
}
function rowValues(sheet,rowNumber,maxColumns=MAX_SCAN_COLUMNS){
  const row=sheet.getRow(rowNumber),values=[];
  const max=Math.min(Math.max(row.cellCount||0,1),maxColumns);
  for(let c=1;c<=max;c++)values.push(cellValue(row.getCell(c)));
  return values
}
function sheetCandidate(sheet){
  const max=Math.min(sheet.rowCount||0,20);
  let best=null;
  for(let r=1;r<=max;r++){
    const values=rowValues(sheet,r);
    const map=headerMap(values),score=Object.keys(map).length;
    if(!best||score>best.score)best={row:r,map,score,headers:values.map(String)}
  }
  return best||{row:1,map:{},score:0,headers:[]}
}
function workbookSensitiveHeaders(workbook){
  const hits=[];
  workbook.worksheets.forEach(sheet=>{
    const maxRows=Math.min(sheet.rowCount||0,20);
    for(let r=1;r<=maxRows;r++){
      rowValues(sheet,r).forEach((value,index)=>{
        const text=String(value||'').trim();
        if(text&&SENSITIVE_HEADER_PATTERNS.some(re=>re.test(text))){
          hits.push({sheet:sheet.name,row:r,column:index+1,header:text})
        }
      })
    }
  });
  return hits
}
async function parseWorkbookBuffer(buffer,fileName='work-summary.xlsx'){
  if(!Buffer.isBuffer(buffer))buffer=Buffer.from(buffer||[]);
  if(!buffer.length)throw new AuthError(400,'EMPTY_FILE','ファイルが空です');
  if(buffer.length>MAX_FILE_BYTES)throw new AuthError(413,'FILE_TOO_LARGE','ファイルサイズは4MB以下にしてください');
  if(!/\.xlsx$/i.test(String(fileName||'')))throw new AuthError(422,'XLSX_REQUIRED','.xlsx形式のみ対応しています');

  const workbook=new ExcelJS.Workbook();
  try{await workbook.xlsx.load(buffer)}catch(_){throw new AuthError(422,'INVALID_XLSX','Excelファイルを解析できません')}

  const sensitive=workbookSensitiveHeaders(workbook);
  if(sensitive.length){
    const labels=sensitive.slice(0,8).map(x=>x.sheet+'!R'+x.row+'C'+x.column+' '+x.header);
    throw new AuthError(422,'SENSITIVE_COLUMNS_NOT_ALLOWED','勤務集計ファイルに取込対象外の機密列があります：'+labels.join('、'))
  }

  let chosen=null;
  workbook.worksheets.forEach(sheet=>{
    const candidate=sheetCandidate(sheet);
    if(!chosen||candidate.score>chosen.score)chosen={sheet,candidate,...candidate}
  });
  if(!chosen)throw new AuthError(422,'NO_WORKSHEET','ワークシートが見つかりません');

  const required=['employee_no','restraint','remaining','overtime','last_posted'];
  const missing=required.filter(k=>!chosen.map[k]);
  const rows=[],blockingIssues=[],warnings=[],seenEmployeeNos=new Set();
  const start=chosen.row+1;
  const sourceEnd=chosen.sheet.rowCount||start-1;
  const end=Math.min(sourceEnd,start+MAX_DATA_ROWS-1);
  const truncated=sourceEnd>end;

  for(let r=start;r<=end;r++){
    const row=chosen.sheet.getRow(r);
    const employeeNo=chosen.map.employee_no?String(cellValue(row.getCell(chosen.map.employee_no))).trim().replace(/\.0$/,''):'';
    if(!employeeNo)continue;

    const item={
      row:r,
      employee_no:employeeNo,
      month:chosen.map.month?String(cellValue(row.getCell(chosen.map.month))).trim():'',
      restraint:chosen.map.restraint?numberCellValue(row.getCell(chosen.map.restraint)):null,
      remaining:chosen.map.remaining?numberCellValue(row.getCell(chosen.map.remaining)):null,
      overtime:chosen.map.overtime?numberCellValue(row.getCell(chosen.map.overtime)):null,
      last_posted:chosen.map.last_posted?dateValue(cellValue(row.getCell(chosen.map.last_posted))):''
    };
    item.month=monthValue(item.month,item.last_posted);

    const errors=[];
    if(seenEmployeeNos.has(employeeNo))errors.push('社員番号がファイル内で重複しています');
    seenEmployeeNos.add(employeeNo);

    ['restraint','remaining','overtime'].forEach(k=>{
      if(chosen.map[k]&&item[k]===null)errors.push(k+'が数値ではありません');
      else if(item[k]!==null&&(item[k]<0||item[k]>1000))errors.push(k+'が許容範囲外です')
    });
    if(chosen.map.last_posted&&!isValidIsoDate(item.last_posted))errors.push('最終計上日が実在する日付か確認してください');
    if(item.month&&!isValidYearMonth(item.month))errors.push('対象月が実在する年月か確認してください');

    if(errors.length)blockingIssues.push({row:r,employee_no:employeeNo,issues:errors});
    if(item.overtime!==null&&item.overtime>=60)warnings.push({row:r,employee_no:employeeNo,issues:['残業60時間以上']});
    else if(item.overtime!==null&&item.overtime>=55)warnings.push({row:r,employee_no:employeeNo,issues:['残業55時間以上']});
    else if(item.overtime!==null&&item.overtime>=45)warnings.push({row:r,employee_no:employeeNo,issues:['残業45時間以上']});
    rows.push(item)
  }

  if(truncated)blockingIssues.push({row:end+1,employee_no:'',issues:['データ行が'+MAX_DATA_ROWS+'件を超えています。分割して確認してください']});
  const canCommit=missing.length===0&&blockingIssues.length===0&&rows.length>0&&!truncated;
  return {
    file_name:fileName,
    sha256:crypto.createHash('sha256').update(buffer).digest('hex'),
    size:buffer.length,
    sheet:chosen.sheet.name,
    header_row:chosen.row,
    detected_fields:Object.keys(chosen.map),
    missing_fields:missing,
    row_count:rows.length,
    blocking_issue_count:blockingIssues.length,
    warning_count:warnings.length,
    overtime_45_count:rows.filter(x=>Number(x.overtime)>=45).length,
    overtime_55_count:rows.filter(x=>Number(x.overtime)>=55).length,
    overtime_60_count:rows.filter(x=>Number(x.overtime)>=60).length,
    truncated,
    can_commit:canCommit,
    preview:rows.slice(0,20),
    blocking_issues:blockingIssues.slice(0,50),
    warnings:warnings.slice(0,50)
  }
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
    const fileName=String(req.headers['x-file-name']||req.query?.file_name||'').trim();
    let buffer;
    if(Buffer.isBuffer(req.body))buffer=req.body;
    else if(typeof req.body==='string')buffer=Buffer.from(req.body,'binary');
    else if(req.body?.file_base64)buffer=Buffer.from(String(req.body.file_base64),'base64');
    else throw new AuthError(400,'INVALID_FILE','Excelファイル本体を読み込めません');

    const preflight=await parseWorkbookBuffer(buffer,fileName);
    const id=requestId(req);applySecurityHeaders(res);res.setHeader('X-Request-Id',id);
    return res.status(200).json({preflight,persistence:'none',data_mode:'preflight-only'})
  }catch(err){
    return sendApiError(req,res,err)
  }
};
module.exports._test={parseWorkbookBuffer,normalizeHeader,headerMap,numberValue,numberCellValue,dateValue,monthValue,isValidIsoDate,isValidYearMonth,workbookSensitiveHeaders};
