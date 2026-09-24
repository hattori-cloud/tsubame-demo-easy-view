const {Pool}=require('pg');
const {databaseEnvPresent}=require('./runtime-config');

let pool=null;

function dbProblem(code,message){
  const err=new Error(message);
  err.status=503;
  err.code=code;
  return err
}
function connectionString(){
  return process.env.DATABASE_URL||process.env.TSUBAME_DATABASE_URL||''
}
function sslConfig(){
  if(process.env.TSUBAME_DB_SSL==='disable')return false;
  const reject=process.env.TSUBAME_DB_SSL_REJECT_UNAUTHORIZED!=='0';
  return {rejectUnauthorized:reject}
}
function getPool(){
  if(!databaseEnvPresent())throw dbProblem('DATABASE_NOT_CONFIGURED','本番データベースが未接続です');
  if(!pool){
    const max=Math.min(20,Math.max(1,Number.parseInt(process.env.TSUBAME_DB_POOL_MAX||'5',10)||5));
    pool=new Pool({
      connectionString:connectionString(),
      ssl:sslConfig(),
      max,
      idleTimeoutMillis:30000,
      connectionTimeoutMillis:5000,
      application_name:'tsubame-v200-api'
    });
    pool.on('error',()=>{})
  }
  return pool
}
async function query(text,params=[],client=null){
  const target=client||getPool();
  return target.query(text,params)
}
async function withTransaction(work){
  const client=await getPool().connect();
  try{
    await client.query('begin');
    const result=await work(client);
    await client.query('commit');
    return result
  }catch(err){
    try{await client.query('rollback')}catch(_){}
    throw err
  }finally{client.release()}
}
async function closePool(){
  if(pool){const p=pool;pool=null;await p.end()}
}
module.exports={databaseConfigured:databaseEnvPresent,getPool,query,withTransaction,closePool};
