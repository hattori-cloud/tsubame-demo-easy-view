const test=require('node:test');
const assert=require('node:assert/strict');

const MONTHS=[
  '2026-10','2026-11','2026-12','2027-01','2027-02','2027-03',
  '2027-04','2027-05','2027-06','2027-07','2027-08','2027-09'
];

// Annual internal-load assumptions.
// These values exist to exercise the system at the company's operating scale.
const STARTING_EMPLOYEES=310;
const ANNUAL_HIRES=50;
const ANNUAL_RETIREMENTS=30;
const TAXI_DRIVER_TARGET=200;
const NEAR_MISS_TARGET_PER_DRIVER_MONTH=2;
const ACCIDENTS_PER_MONTH=20;
const COMPLAINTS_BY_MONTH=[4,5,4,6,5,4,6,5,5,6,5,5]; // 60/year synthetic load
const TRAINING_PER_MONTH=8;
const QUALIFICATIONS_PER_MONTH=15;
const DOCUMENTS_PER_MONTH=10;
const APPLICATIONS_PER_MONTH=8;

function buildEmployees(){
  const rows=[];
  for(let i=0;i<STARTING_EMPLOYEES;i++){
    rows.push({
      id:'EMP-'+String(i+1).padStart(4,'0'),
      employee_no:String(1000+i),
      department:i<TAXI_DRIVER_TARGET?'タクシー課':'その他',
      office:i%3===0?'府中':'本社',
      lifecycle_status:'active'
    });
  }
  for(let i=0;i<ANNUAL_HIRES;i++){
    rows.push({
      id:'HIRE-'+String(i+1).padStart(3,'0'),
      employee_no:String(7000+i),
      department:i<30?'タクシー課':'その他',
      office:i%4===0?'府中':'本社',
      lifecycle_status:'active'
    });
  }
  for(let i=0;i<ANNUAL_RETIREMENTS;i++){
    rows[i].lifecycle_status='retired';
    rows[i].retired_on=MONTHS[Math.floor(i/3)%MONTHS.length]+'-20';
  }
  return rows;
}

function buildTaxiDrivers(){
  // Monthly target snapshots keep the operating population at roughly 200.
  // This deliberately remains independent from later lifecycle changes.
  return Array.from({length:TAXI_DRIVER_TARGET},(_,i)=>({
    id:'EMP-'+String(i+1).padStart(4,'0'),
    employee_no:String(1000+i),
    name:'テスト乗務員'+String(i+1).padStart(3,'0'),
    office:i%3===0?'府中':'本社',
    department:'タクシー課'
  }));
}

function buildNearMisses(drivers){
  let seq=1;
  const rows=[];
  for(const month of MONTHS){
    drivers.forEach((driver,index)=>{
      let count=NEAR_MISS_TARGET_PER_DRIVER_MONTH;
      // One month deliberately keeps the department total at 400 while
      // creating individual non-compliance: 10 drivers submit 1, another
      // 10 submit 3. Aggregate-only monitoring must not miss this.
      if(month==='2027-04'){
        if(index<10)count=1;
        else if(index<20)count=3;
      }
      for(let k=0;k<count;k++){
        rows.push({
          id:'NM-'+String(seq++).padStart(6,'0'),
          employee_id:driver.id,
          employee_no_at_report:driver.employee_no,
          employee_name_at_report:driver.name,
          office_at_report:driver.office,
          department_at_report:'タクシー課',
          reported_on:month+'-'+String(((index+k)%27)+1).padStart(2,'0'),
          occurred_on:month+'-'+String(((index+k)%27)+1).padStart(2,'0'),
          risk_level:(index+k)%11===0?'高い':(index+k)%3===0?'中程度':'低い',
          summary:'年間内部テスト用ヒヤリハット',
          prevention:'確認手順を再確認'
        });
      }
    });
  }
  return rows;
}

function buildAccidents(employees){
  let seq=1;
  const rows=[];
  for(let mi=0;mi<MONTHS.length;mi++){
    for(let i=0;i<ACCIDENTS_PER_MONTH;i++){
      const employee=employees[(mi*23+i*7)%employees.length];
      rows.push({
        id:'ACC-'+String(seq++).padStart(5,'0'),
        employee_id:employee.id,
        occurred_on:MONTHS[mi]+'-'+String(((i*2)%27)+1).padStart(2,'0'),
        phase:i%5===0?'investigating':'completed',
        cause:'確認不足',
        prevention:'安全確認手順を再指導',
        response_history:'本人確認・管理者確認を記録',
        company_repair_cost:(i%4)*35000,
        opponent_repair_cost:(i%5)*28000
      });
    }
  }
  return rows;
}

function buildComplaints(employees){
  let seq=1;
  const rows=[];
  for(let mi=0;mi<MONTHS.length;mi++){
    for(let i=0;i<COMPLAINTS_BY_MONTH[mi];i++){
      const employee=employees[(mi*17+i*11)%employees.length];
      rows.push({
        id:'CMP-'+String(seq++).padStart(5,'0'),
        employee_id:employee.id,
        responded_on:MONTHS[mi]+'-'+String(((i*3)%27)+1).padStart(2,'0'),
        status:i%4===0?'open':'completed',
        rank:['A','B','C'][i%3],
        summary:'年間内部テスト用苦情記録'
      });
    }
  }
  return rows;
}

function buildMonthlyRecords(employees,countPerMonth,prefix){
  let seq=1;
  const rows=[];
  for(let mi=0;mi<MONTHS.length;mi++){
    for(let i=0;i<countPerMonth;i++){
      const employee=employees[(mi*13+i*5)%employees.length];
      rows.push({
        id:prefix+'-'+String(seq++).padStart(5,'0'),
        employee_id:employee.id,
        month:MONTHS[mi]
      });
    }
  }
  return rows;
}

function complianceForMonth(drivers,nearMisses,month,target=NEAR_MISS_TARGET_PER_DRIVER_MONTH){
  return drivers.map(driver=>{
    const submitted=nearMisses.filter(row=>row.employee_id===driver.id&&row.reported_on.startsWith(month)).length;
    return {
      employee_id:driver.id,
      submitted,
      target,
      state:submitted>=target?'met':submitted===0?'zero':'short'
    };
  });
}

test('one-year capacity model retains retirees and grows the employee master safely',()=>{
  const employees=buildEmployees();
  assert.equal(employees.length,STARTING_EMPLOYEES+ANNUAL_HIRES);
  assert.equal(employees.filter(x=>x.lifecycle_status==='retired').length,ANNUAL_RETIREMENTS);
  assert.equal(employees.filter(x=>x.lifecycle_status==='active').length,330);
});

test('200 taxi drivers x 2 reports x 12 months creates 4,800 near-miss rows',()=>{
  const drivers=buildTaxiDrivers();
  const nearMisses=buildNearMisses(drivers);
  assert.equal(nearMisses.length,4800);
  for(const month of MONTHS){
    assert.equal(
      nearMisses.filter(x=>x.reported_on.startsWith(month)).length,
      400,
      month+' must total 400 reports'
    );
  }
});

test('aggregate 400 reports does not hide individual monthly quota shortages',()=>{
  const drivers=buildTaxiDrivers();
  const nearMisses=buildNearMisses(drivers);
  const rows=complianceForMonth(drivers,nearMisses,'2027-04');
  assert.equal(rows.reduce((sum,x)=>sum+x.submitted,0),400);
  assert.equal(rows.filter(x=>x.state==='short').length,10);
  assert.equal(rows.filter(x=>x.state==='met').length,190);
});

test('accident load models about 20 accidents every month / 240 per year',()=>{
  const accidents=buildAccidents(buildEmployees());
  assert.equal(accidents.length,240);
  for(const month of MONTHS){
    assert.equal(accidents.filter(x=>x.occurred_on.startsWith(month)).length,20);
  }
  assert.ok(accidents.some(x=>x.phase==='investigating'));
  assert.ok(accidents.some(x=>x.company_repair_cost>0||x.opponent_repair_cost>0));
});

test('one-year combined operational record volume remains internally referentially valid',()=>{
  const employees=buildEmployees();
  const employeeIds=new Set(employees.map(x=>x.id));
  const nearMisses=buildNearMisses(buildTaxiDrivers());
  const accidents=buildAccidents(employees);
  const complaints=buildComplaints(employees);
  const training=buildMonthlyRecords(employees,TRAINING_PER_MONTH,'TR');
  const qualifications=buildMonthlyRecords(employees,QUALIFICATIONS_PER_MONTH,'QUAL');
  const documents=buildMonthlyRecords(employees,DOCUMENTS_PER_MONTH,'DOC');
  const applications=buildMonthlyRecords(employees,APPLICATIONS_PER_MONTH,'APP');

  const all=[...nearMisses,...accidents,...complaints,...training,...qualifications,...documents,...applications];
  assert.equal(all.filter(x=>!employeeIds.has(x.employee_id)).length,0);

  assert.equal(nearMisses.length,4800);
  assert.equal(accidents.length,240);
  assert.equal(complaints.length,60);
  assert.equal(training.length,96);
  assert.equal(qualifications.length,180);
  assert.equal(documents.length,120);
  assert.equal(applications.length,96);
  assert.equal(all.length,5592);
});

test('every generated near-miss keeps a stable employee reference and reporting snapshot',()=>{
  const employees=buildEmployees();
  const employeeIds=new Set(employees.map(x=>x.id));
  const nearMisses=buildNearMisses(buildTaxiDrivers());
  assert.equal(nearMisses.filter(x=>!employeeIds.has(x.employee_id)).length,0);
  assert.equal(
    nearMisses.filter(x=>
      !x.employee_no_at_report||
      !x.employee_name_at_report||
      !x.office_at_report||
      !x.department_at_report||
      !x.reported_on
    ).length,
    0
  );
});

test('pagination bounds annual high-volume lists instead of rendering everything',()=>{
  const employees=buildEmployees();
  const nearMisses=buildNearMisses(buildTaxiDrivers());
  const accidents=buildAccidents(employees);

  assert.equal(Math.ceil(nearMisses.length/20),240);
  assert.equal(Math.ceil(400/20),20,'one near-miss month is 20 pages at 20 rows');
  assert.equal(Math.ceil(accidents.length/10),24,'annual accidents are 24 pages at 10 rows');
  assert.equal(Math.ceil(20/10),2,'one accident month is only 2 pages');
});

test('five-year projection is still a database-scale problem, not a browser-all-data problem',()=>{
  const fiveYear={
    nearMisses:4800*5,
    accidents:240*5,
    complaints:60*5,
    training:96*5,
    qualifications:180*5,
    documents:120*5,
    applications:96*5
  };
  assert.deepEqual(fiveYear,{
    nearMisses:24000,
    accidents:1200,
    complaints:300,
    training:480,
    qualifications:900,
    documents:600,
    applications:480
  });
  assert.equal(Object.values(fiveYear).reduce((a,b)=>a+b,0),27960);
});
