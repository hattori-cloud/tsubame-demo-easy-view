const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const sql=fs.readFileSync(path.join(__dirname,'..','docs','production-schema.sql'),'utf8');

function duplicates(values){
  const counts=new Map();
  values.forEach(v=>counts.set(v,(counts.get(v)||0)+1));
  return [...counts.entries()].filter(([,n])=>n>1)
}

test('production schema declares each table once',()=>{
  const tables=[...sql.matchAll(/create\s+table\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi)].map(m=>m[1]);
  assert.equal(tables.length,23);
  assert.deepEqual(duplicates(tables),[])
});

test('production schema index names are unique',()=>{
  const indexes=[...sql.matchAll(/create\s+(?:unique\s+)?index\s+(?:if\s+not\s+exists\s+)?([a-z0-9_]+)/gi)].map(m=>m[1]);
  assert.ok(indexes.length>=30);
  assert.deepEqual(duplicates(indexes),[])
});

test('three-digit car number checks are complete',()=>{
  const checks=[...sql.matchAll(/car_no[^\n]*check\s*\([^\n]*/gi)].map(m=>m[0]);
  assert.ok(checks.length>=4);
  checks.forEach(line=>assert.match(line,/\^\[0-9\]\{3\}\$/))
});

test('schema transaction is balanced',()=>{
  assert.match(sql,/^begin;/mi);
  assert.match(sql,/^commit;/mi)
});

test('document policy rules enforce strict security',()=>{
  assert.match(sql,/create table document_policy_rules/i);
  assert.match(sql,/security_class <> 'strict' or access_level = 'full_admin'/);
  assert.match(sql,/security_class <> 'strict' or verification_required = true/);
  assert.match(sql,/retention_years is null or retention_years between 1 and 99/)
});

test('document storage lifecycle and purge approval are fail-closed',()=>{
  assert.match(sql,/content_sha256 char\(64\) check \(content_sha256 is null or content_sha256 ~ '\^\[0-9a-f\]\{64\}\$'\),/);
  assert.match(sql,/malware_scan_status text not null default 'not_scanned'/);
  assert.match(sql,/malware_scan_status in \('not_scanned','pending','clean','blocked','error'\)/);
  assert.match(sql,/malware_scanned_at timestamptz/);
  assert.match(sql,/storage_state text not null default 'not_uploaded'/);
  assert.match(sql,/storage_state in \('not_uploaded','quarantine','active','blocked','restore_only','purged'\)/);
  assert.match(sql,/uploaded_by_user_id uuid references users\(id\)/);
  assert.match(sql,/create table document_purge_requests/i);
  assert.match(sql,/approved_by_user_id <> requested_by_user_id/);
  assert.match(sql,/state in \('requested','approved','rejected','executed','failed','cancelled'\)/);
});


test('every simple production index references an existing table column',()=>{
  const tableColumns=new Map();
  for(const match of sql.matchAll(/create\s+table\s+([a-z0-9_]+)\s*\(([\s\S]*?)\n\);/gi)){
    const columns=new Set();
    for(const line of match[2].split('\n')){
      const column=/^\s*([a-z][a-z0-9_]*)\s+/i.exec(line);
      if(column&&!/^(check|unique|primary|foreign|constraint)$/i.test(column[1]))columns.add(column[1]);
    }
    tableColumns.set(match[1],columns);
  }
  const invalid=[];
  for(const match of sql.matchAll(/create\s+(?:unique\s+)?index\s+([a-z0-9_]+)\s+on\s+([a-z0-9_]+)\s*\(([^)]*)\)/gi)){
    const [,indexName,tableName,inside]=match;
    const columns=inside.split(',').map(x=>x.trim().split(/\s+/)[0].replace(/["']/g,'')).filter(Boolean);
    for(const column of columns){
      if(/^[a-z][a-z0-9_]*$/i.test(column)&&tableColumns.has(tableName)&&!tableColumns.get(tableName).has(column)){
        invalid.push(indexName+' -> '+tableName+'.'+column);
      }
    }
  }
  assert.deepEqual(invalid,[])
});


test('audit and record history tables are append-only at database layer',()=>{
  assert.match(sql,/create or replace function reject_append_only_mutation\(\)/i);
  assert.match(sql,/raise exception 'append-only table % does not allow %'/i);
  assert.match(sql,/create trigger audit_logs_append_only_guard[\s\S]*before update or delete on audit_logs/i);
  assert.match(sql,/create trigger record_histories_append_only_guard[\s\S]*before update or delete on record_histories/i);
  assert.match(sql,/create trigger employee_number_history_append_only_guard[\s\S]*before update or delete on employee_number_history/i);
});

test('employee number history supports safe renumbering without rewriting employee foreign keys',()=>{
  assert.match(sql,/create table employee_number_history/i);
  assert.match(sql,/employee_id uuid not null references employees\(id\)/i);
  assert.match(sql,/old_employee_no text not null/i);
  assert.match(sql,/new_employee_no text not null/i);
  assert.match(sql,/reason text not null/i);
  assert.match(sql,/changed_by_user_id uuid references users\(id\)/i);
  assert.match(sql,/check \(old_employee_no <> new_employee_no\)/i);
  assert.match(sql,/create index employee_number_history_old_idx on employee_number_history \(old_employee_no, changed_at desc\)/i);
});


test('production users schema supports three-field login without storing plaintext passwords',()=>{
  assert.match(sql,/login_id text not null unique/i);
  assert.match(sql,/password_hash text not null/i);
  assert.match(sql,/failed_login_count integer not null default 0/i);
  assert.match(sql,/locked_until timestamptz/i);
  assert.match(sql,/last_login_at timestamptz/i);
  assert.doesNotMatch(sql,/\bpassword\s+text\b/i);
});
