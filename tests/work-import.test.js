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

test('blank work-hour cells are blocking instead of becoming zero',async()=>{
  const buffer=await workbookBuffer(async wb=>{
    const ws=wb.addWorksheet('勤務');
    ws.addRow(['社員番号','対象月','拘束時間','残時間','残業時間','最終計上日']);
    ws.addRow(['1001','2026-09','','','','2026-09-20'])
  });
  const p=await parseWorkbookBuffer(buffer,'work.xlsx');
  assert.equal(p.can_commit,false);
  assert.ok(p.blocking_issues.some(x=>x.employee_no==='1001'&&x.issues.filter(v=>v.includes('数値ではありません')).length>=3))
});

test('impossible month and calendar date are blocking',async()=>{
  const buffer=await workbookBuffer(async wb=>{
    const ws=wb.addWorksheet('勤務');
    ws.addRow(['社員番号','対象月','拘束時間','残時間','残業時間','最終計上日']);
    ws.addRow(['1001','2026-13',228,72,10,'2026-13-40']);
    ws.addRow(['1002','2026-02',228,72,10,'2026-02-30'])
  });
  const p=await parseWorkbookBuffer(buffer,'work.xlsx');
  assert.equal(p.can_commit,false);
  assert.ok(p.blocking_issues.some(x=>x.employee_no==='1001'&&x.issues.some(v=>v.includes('対象月'))));
  assert.ok(p.blocking_issues.some(x=>x.employee_no==='1001'&&x.issues.some(v=>v.includes('最終計上日'))));
  assert.ok(p.blocking_issues.some(x=>x.employee_no==='1002'&&x.issues.some(v=>v.includes('最終計上日'))))
});

test('invalid explicit target month is rejected instead of being replaced by last posted month',async()=>{
  const buffer=await workbookBuffer(async wb=>{
    const ws=wb.addWorksheet('勤務');
    ws.addRow(['社員番号','対象月','拘束時間','残時間','残業時間','最終計上日']);
    ws.addRow(['1001','September 2026',228,72,10,'2026-09-20'])
  });
  const p=await parseWorkbookBuffer(buffer,'work.xlsx');
  assert.equal(p.can_commit,false);
  assert.equal(p.preview[0].month,'September 2026');
  assert.ok(p.blocking_issues.some(x=>x.employee_no==='1001'&&x.issues.some(v=>v.includes('対象月'))))
});

test('blank target month may be derived from a valid last posted date',async()=>{
  const buffer=await workbookBuffer(async wb=>{
    const ws=wb.addWorksheet('勤務');
    ws.addRow(['社員番号','対象月','拘束時間','残時間','残業時間','最終計上日']);
    ws.addRow(['1001','',228,72,10,'2026-09-20'])
  });
  const p=await parseWorkbookBuffer(buffer,'work.xlsx');
  assert.equal(p.can_commit,true);
  assert.equal(p.preview[0].month,'2026-09')
});

test('leap-day validation accepts real leap day and rejects non-leap equivalent',async()=>{
  const good=await workbookBuffer(async wb=>{
    const ws=wb.addWorksheet('勤務');
    ws.addRow(['社員番号','対象月','拘束時間','残時間','残業時間','最終計上日']);
    ws.addRow(['1001','2028-02',228,72,10,'2028-02-29'])
  });
  const bad=await workbookBuffer(async wb=>{
    const ws=wb.addWorksheet('勤務');
    ws.addRow(['社員番号','対象月','拘束時間','残時間','残業時間','最終計上日']);
    ws.addRow(['1001','2027-02',228,72,10,'2027-02-29'])
  });
  assert.equal((await parseWorkbookBuffer(good,'work.xlsx')).can_commit,true);
  assert.equal((await parseWorkbookBuffer(bad,'work.xlsx')).can_commit,false)
});

test('Excel [h]:mm duration cells are converted to hours',async()=>{
  const buffer=await workbookBuffer(async wb=>{
    const ws=wb.addWorksheet('勤務');
    ws.addRow(['社員番号','対象月','拘束時間','残時間','残業時間','最終計上日']);
    const row=ws.addRow(['1001','2026-09',228/24,72/24,10/24,'2026-09-20']);
    row.getCell(3).numFmt='[h]:mm';
    row.getCell(4).numFmt='[h]:mm';
    row.getCell(5).numFmt='[h]:mm'
  });
  const p=await parseWorkbookBuffer(buffer,'work.xlsx');
  assert.equal(p.can_commit,true);
  assert.ok(Math.abs(p.preview[0].restraint-228)<0.001);
  assert.ok(Math.abs(p.preview[0].remaining-72)<0.001);
  assert.ok(Math.abs(p.preview[0].overtime-10)<0.001)
});



test('Excel 1904 date system duration Date cells use the 1904 epoch',async()=>{
  const {numberCellValue}=require('../api/v1/work-import/preflight')._test;
  const fakeCell={value:new Date(Date.UTC(1904,0,3,12,30)),numFmt:'[h]:mm'};
  assert.ok(Math.abs(numberCellValue(fakeCell,{date1904:true})-60.5)<0.001);

  const buffer=await workbookBuffer(async wb=>{
    wb.properties.date1904=true;
    const ws=wb.addWorksheet('勤務');
    ws.addRow(['社員番号','対象月','拘束時間','残時間','残業時間','最終計上日']);
    const row=ws.addRow(['1001','2026-09',60.5/24,12/24,8/24,'2026-09-20']);
    row.getCell(3).numFmt='[h]:mm';
    row.getCell(4).numFmt='[h]:mm';
    row.getCell(5).numFmt='[h]:mm'
  });
  const p=await parseWorkbookBuffer(buffer,'work.xlsx');
  assert.equal(p.can_commit,true);
  assert.ok(Math.abs(p.preview[0].restraint-60.5)<0.001);
  assert.ok(Math.abs(p.preview[0].remaining-12)<0.001);
  assert.ok(Math.abs(p.preview[0].overtime-8)<0.001)
});
