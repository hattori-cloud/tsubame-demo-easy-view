const test=require('node:test');
const assert=require('node:assert/strict');
const ExcelJS=require('@ayocore/exceljs');
const {parseWorkbookBuffer}=require('../api/v1/work-import/preflight')._test;

async function workbookBuffer(build){
  const wb=new ExcelJS.Workbook();
  await build(wb);
  return Buffer.from(await wb.xlsx.writeBuffer())
}

test('valid work-summary workbook is accepted for preflight only',async()=>{
  const buffer=await workbookBuffer(async wb=>{
    const ws=wb.addWorksheet('勤務');
    ws.addRow(['社員番号','対象月','拘束時間','残時間','残業時間','最終計上日']);
    ws.addRow(['1001','2026-09',228,72,44,'2026-09-20']);
    ws.addRow(['1002','2026-09',240,60,61,'2026-09-20'])
  });
  const p=await parseWorkbookBuffer(buffer,'work.xlsx');
  assert.equal(p.row_count,2);
  assert.equal(p.can_commit,true);
  assert.equal(p.blocking_issue_count,0);
  assert.equal(p.overtime_60_count,1);
  assert.equal(p.warning_count,1)
});

test('duplicate employee rows block commit readiness',async()=>{
  const buffer=await workbookBuffer(async wb=>{
    const ws=wb.addWorksheet('勤務');
    ws.addRow(['社員番号','拘束時間','残時間','残業時間','最終計上日']);
    ws.addRow(['1001',228,72,10,'2026-09-20']);
    ws.addRow(['1001',229,71,11,'2026-09-20'])
  });
  const p=await parseWorkbookBuffer(buffer,'work.xlsx');
  assert.equal(p.can_commit,false);
  assert.ok(p.blocking_issues.some(x=>x.issues.some(v=>v.includes('重複'))))
});

test('missing required column blocks commit readiness',async()=>{
  const buffer=await workbookBuffer(async wb=>{
    const ws=wb.addWorksheet('勤務');
    ws.addRow(['社員番号','拘束時間','残時間','最終計上日']);
    ws.addRow(['1001',228,72,'2026-09-20'])
  });
  const p=await parseWorkbookBuffer(buffer,'work.xlsx');
  assert.equal(p.can_commit,false);
  assert.ok(p.missing_fields.includes('overtime'))
});

test('invalid numeric or date values are blocking issues',async()=>{
  const buffer=await workbookBuffer(async wb=>{
    const ws=wb.addWorksheet('勤務');
    ws.addRow(['社員番号','拘束時間','残時間','残業時間','最終計上日']);
    ws.addRow(['1001','abc',72,-5,'not-a-date'])
  });
  const p=await parseWorkbookBuffer(buffer,'work.xlsx');
  assert.equal(p.can_commit,false);
  assert.ok(p.blocking_issue_count>=1)
});

test('sensitive header on another worksheet rejects the whole workbook',async()=>{
  const buffer=await workbookBuffer(async wb=>{
    const ws=wb.addWorksheet('勤務');
    ws.addRow(['社員番号','拘束時間','残時間','残業時間','最終計上日']);
    ws.addRow(['1001',228,72,10,'2026-09-20']);
    const secret=wb.addWorksheet('別シート');
    secret.addRow(['社員番号','給与','口座番号']);
    secret.addRow(['1001',123456,'0000000'])
  });
  await assert.rejects(
    ()=>parseWorkbookBuffer(buffer,'work.xlsx'),
    err=>err&&err.code==='SENSITIVE_COLUMNS_NOT_ALLOWED'
  )
});
