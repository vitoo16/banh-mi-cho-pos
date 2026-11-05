import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {cpSync,mkdirSync,mkdtempSync,readFileSync,rmSync,symlinkSync,writeFileSync} from 'node:fs';
import {createServer} from 'node:net';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const repoRoot=resolve(import.meta.dirname,'..');
const hubSource=join(repoRoot,'apps/store-hub');

async function freeLoopbackPort(){
 const server=createServer();
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
 });
 const port=server.address().port;
 await new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve()));
 return port;
}
async function waitFor(predicate,description,timeoutMs=45_000){
 const deadline=Date.now()+timeoutMs;
 while(Date.now()<deadline){
  if(predicate())return;
  await delay(150);
 }
 throw new Error('Timed out waiting for '+description);
}
async function http(base,path,options={}){
 const response=await fetch(base+path,{...options,signal:AbortSignal.timeout(3000)});
 const body=await response.json();
 return {status:response.status,ok:response.ok,body};
}
async function login(base,pin){
 const result=await http(base,'/v1/auth/login',{
  method:'POST',
  headers:{'Content-Type':'application/json'},
  body:JSON.stringify({user_id:'staff',pin}),
 });
 assert.equal(result.status,200,'Staff login must work through dev:hub: '+JSON.stringify(result.body));
 assert.equal(typeof result.body.token,'string');
 return result.body.token;
}
async function canBind(port){
 const server=createServer();
 try{
  await new Promise((resolve,reject)=>{
   server.once('error',reject);
   server.listen(port,'127.0.0.1',resolve);
  });
  return true;
 }catch{return false}
 finally{if(server.listening)await new Promise(resolve=>server.close(resolve));}
}

test('DEF-DEV-01: npm run dev:hub preserves Nest DI, serves real HTTP, hot-restarts, and shuts down cleanly',{
 timeout:120_000,
},async()=>{
 const temp=mkdtempSync(join(tmpdir(),'bmc-dev-hub-watch-'));
 const tempRepo=join(temp,'repo');
 const tempHub=join(tempRepo,'apps','store-hub');
 mkdirSync(tempHub,{recursive:true});
 let child;
 let output='';
 const port=await freeLoopbackPort();
 const base='http://127.0.0.1:'+port;
 const staffPin='fixture-staff-watch-2026';

 try{
  // Isolate source and SQLite; reuse only the already-installed dependency tree.
  cpSync(join(repoRoot,'package.json'),join(tempRepo,'package.json'));
  cpSync(join(hubSource,'package.json'),join(tempHub,'package.json'));
  cpSync(join(hubSource,'tsconfig.json'),join(tempHub,'tsconfig.json'));
  cpSync(join(hubSource,'src'),join(tempHub,'src'),{recursive:true});
  cpSync(join(hubSource,'scripts'),join(tempHub,'scripts'),{recursive:true});
  symlinkSync(join(repoRoot,'node_modules'),join(tempRepo,'node_modules'),process.platform==='win32'?'junction':'dir');

  const npmCli=process.env.npm_execpath;
  const command=npmCli?process.execPath:process.platform==='win32'?'npm.cmd':'npm';
  const args=npmCli?[npmCli,'run','dev:hub']:['run','dev:hub'];
  child=spawn(command,args,{
   cwd:tempRepo,
   env:{
    ...process.env,
    NODE_ENV:'test',
    STORE_DB_PATH:join(temp,'isolated-store.sqlite'),
    HUB_BIND_HOST:'127.0.0.1',
    HUB_PORT:String(port),
    BOOTSTRAP_OWNER_PIN:'fixture-owner-watch-2026',
    BOOTSTRAP_CASHIER_PIN:'fixture-cashier-watch-2026',
    BOOTSTRAP_STAFF_PIN:staffPin,
    SEED_DEMO_CATALOG:'1',
    PAIRING_ENFORCED:'0',
    CLOUD_SYNC_URL:'',
    PRINTER_HOST:'',
    BANK_BRIDGE_SECRET:'',
   },
   windowsHide:true,
   shell:!npmCli&&process.platform==='win32',
   stdio:['ignore','pipe','pipe'],
  });
  for(const stream of [child.stdout,child.stderr]){
   stream.on('data',chunk=>{output=(output+chunk.toString()).slice(-20_000)});
  }

  await waitFor(()=>/BMC PILOT HUB 127\.0\.0\.1:/.test(output),'compiled Store Hub startup');
  let health;
  for(let attempt=0;attempt<40;attempt++){
   try{health=await http(base,'/v1/health');if(health.ok)break;}catch{}
   await delay(150);
  }
  assert.equal(health?.status,200,'GET /v1/health must succeed; output: '+output);

  let token=await login(base,staffPin);
  let catalog=await http(base,'/v1/catalog',{headers:{Authorization:'Bearer '+token}});
  assert.equal(catalog.status,200,'GET /v1/catalog must succeed; output: '+output);

  // Touch a copied, imported controller source file. The compiler must emit
  // controller.js and Node --watch must restart the actual Hub process.
  const controllerPath=join(tempHub,'src','controller.ts');
  const controllerSource=readFileSync(controllerPath,'utf8');
  const firstStartCount=(output.match(/BMC PILOT HUB/g)||[]).length;
  writeFileSync(controllerPath,controllerSource+'\n// DEV_HUB_WATCH_RESTART_FIXTURE\n');
  await waitFor(()=>((output.match(/BMC PILOT HUB/g)||[]).length)>firstStartCount,'Node watch restart after TypeScript recompilation');
  health=undefined;
  for(let attempt=0;attempt<40;attempt++){
   try{health=await http(base,'/v1/health');if(health.ok)break;}catch{}
   await delay(150);
  }
  assert.equal(health?.status,200,'Hub must serve HTTP after watch restart; output: '+output);
  token=await login(base,staffPin);
  catalog=await http(base,'/v1/catalog',{headers:{Authorization:'Bearer '+token}});
  assert.equal(catalog.status,200,'DI must remain intact after watch restart');

  assert.ok(child.kill('SIGTERM'),'SIGTERM must be delivered to the npm dev:hub process');
  await waitFor(()=>child.exitCode!==null||child.signalCode!==null,'dev:hub process exit after SIGTERM',15_000);
  assert.ok(child.exitCode===0||child.exitCode===143||child.signalCode==='SIGTERM', 'dev:hub must terminate without an unrelated crash; output: '+output);
  let stillHealthy=true;
  try{await http(base,'/v1/health');}catch{stillHealthy=false;}
  assert.equal(stillHealthy,false,'Hub listener must be closed after shutdown');
  assert.equal(await canBind(port),true,'Hub port must be released; no orphan runtime process');
 }finally{
  if(child&&child.exitCode===null&&child.signalCode===null){
   child.kill('SIGTERM');
   await Promise.race([
    new Promise(resolve=>child.once('exit',resolve)),
    delay(10_000),
   ]);
   if(child.exitCode===null)child.kill();
  }
  rmSync(temp,{recursive:true,force:true});
 }
});
