const test=require('node:test');
const assert=require('node:assert/strict');

const MONTHS=[
  '2026-10','2026-11','2026-12','2027-01','2027-02','2027-03',
  '2027-04','2027-05','2027-06','2027-07','2027-08','2027-09'
];

function buildEmployees(){
  const rows=[];
  for(let i=0;i<310;i++){
    rows.push({
      id:'EMP-'+String(i+1).padStart(4,'0'),
      employee_no:String(1000+i),
      department:i<200?'タクシー課':'その他',
      lifecycle_status:'active'
    })
  }
  for(let i=0;i<50;i++){
    rows.push({
      id:'HIRE-'+String(i+1).padStart(3,'0'),
      employee_no:String(7000+i),
      department:'その他',
      lifecycle_status:'active'
    })
  }
  for(let i=0;i<30;i++)rows[i].lifecycle_status='retired';
  return rows
}

function buildTaxiDrivers(){
  return Array.from({length:200},(_,i)=>({
    id:'EMP-'+String(i+1).padStart(4,'0'),
    employee_no:String(1000+i),
    department:'タクシー課'
  }))
}

function buildNearMisses(drivers){
  let seq=1;
  const rows=[];
  for(const month of MONTHS){
    drivers.forEach((driver,index)=>{
      let count=2;
      // One month deliberately keeps the department total at 400 while
      // creating individual non-compliance: 10 drivers submit 1, another
      // 10 submit 3. Aggregate-only monitoring would miss the first group.
      if(month==='2027-04'){
        if(index<10)count=1;
        else if(index<20)count=3;
      }
      for(let k=0;k<count;k++){
        rows.push({
          id:'NM-'+String(seq++).padStart(6,'0'),
          employee_id:driver.id,
          employee_no_at_report:driver.employee_no,
          department_at_report:'タクシー課',
          reported_on:month+'-'+String(((index+k)%27)+1).padStart(2,'0')
        })
      }
    })
  }
  return rows
}

function complianceForMonth(drivers,nearMisses,month,target=2){
  return drivers.map(driver=>{
    const submitted=nearMisses.filter(row=>row.employee_id===driver.id&&row.reported_on.startsWith(month)).length;
    return {employee_id:driver.id,submitted,target,state:submitted>=target?'met':submitted===0?'zero':'short'}
  })
}

test('one-year capacity model retains retirees and grows the employee master safely',()=>{
  const employees=buildEmployees();
  assert.equal(employees.length,360,'310 starting employees + 50 hires stay in the master');
  assert.equal(employees.filter(x=>x.lifecycle_status==='retired').length,30);
  assert.equal(employees.filter(x=>x.lifecycle_status==='active').length,330);
});

test('200 taxi drivers x 2 reports x 12 months creates 4,800 near-miss rows',()=>{
  const drivers=buildTaxiDrivers();
  const nearMisses=buildNearMisses(drivers);
  assert.equal(nearMisses.length,4800);
  for(const month of MONTHS){
    assert.equal(nearMisses.filter(x=>x.reported_on.startsWith(month)).length,400,month+' must total 400 reports');
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

test('every generated near-miss keeps a stable employee reference and reporting snapshot',()=>{
  const employees=buildEmployees();
  const employeeIds=new Set(employees.map(x=>x.id));
  const nearMisses=buildNearMisses(buildTaxiDrivers());
  assert.equal(nearMisses.filter(x=>!employeeIds.has(x.employee_id)).length,0);
  assert.equal(nearMisses.filter(x=>!x.employee_no_at_report||!x.department_at_report||!x.reported_on).length,0);
});

test('20-row pagination bounds the largest annual near-miss list',()=>{
  const nearMisses=buildNearMisses(buildTaxiDrivers());
  const perPage=20;
  assert.equal(Math.ceil(nearMisses.length/perPage),240);
  assert.equal(Math.ceil(400/perPage),20,'one month of 400 reports is 20 bounded pages');
});
