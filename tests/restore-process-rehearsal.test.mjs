import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn,spawnSync} from 'node:child_process';
import {createServer} from 'node:net';
import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

const backupCLI=resolve('scripts/store-backup.mjs');
const env={
 SEED_DEMO_CATALOG:'1',
 BOOTSTRAP_OWNER_PIN:'fixture-restore-owner',
 BOOTSTRAP_CASHIER_PIN:'fixture-restore-cashier',
 BOOTSTRAP_STAFF_PIN:'fixture-restore-staff',
 CLOUD_SYNC_URL:'',PRINTER_HOST:'',PAIRING_ENFORCED:'0',
};

async function freePort(){
 const sock=createServer();
 await new Promise((resolve,reject)=>sock.once('error',reject).listen(0,'127.0.0.1',resolve));
 const port=sock.address().port;
 await new Promise((resolve,reject)=>sock.close(e=>e?reject(e):resolve()));
 return port;
}
async function startHub(path,port){
 const child=spawn(process.execPath,['apps/store-hub/dist/main.js'],{
  cwd:resolve('.'),
  env:{...process.env,...env,STORE_DB_PATH:path,HUB_BIND_HOST:'127.0.0.1',HUB_PORT:String(port)},
  stdio:['ignore','pipe','pipe'],
 });
 let output='';
 for(const stream of [child.stdout,child.stderr])
  stream.on('data',buf=>{output=(output+String(buf)).slice(-5000)});
 const base='http://127.0.0.1:'+port;
 for(let i=0;i<80;i++){
  if(child.exitCode!==null||child.signalCode!==null)throw Error('Hub exited: '+output);
  try{
   const res=await fetch(base+'/v1/health',{signal:AbortSignal.timeout(500)});
   if(res.ok)return {child,base};
  }catch{}
  await delay(125);
 }
 await stopHub(child);
 throw Error('Hub did not start: '+output);
}
async function stopHub(child){
 if(!child||child.exitCode!==null||child.signalCode!==null)return;
 const exiting=new Promise(resolve=>child.once('exit',resolve));
 assert.ok(child.kill('SIGKILL'),'Expected test child Hub can be stopped');
 await Promise.race([exiting,delay(5000).then(()=>{throw Error('Hub did not stop')})]);
}
async function call(base,path,options={}){
 const r=await fetch(base+path,{...options,signal:AbortSignal.timeout(8000)});
 return {status:r.status,body:await r.json()};
}
function post(base,path,token,key,body){
 return call(base,path,{
  method:'POST',
  headers:{'Content-Type':'application/json',Authorization:'Bearer '+token,'Idempotency-Key':key},
  body:JSON.stringify(body),
 });
}
async function login(base,id,pin){
 const r=await call(base,'/v1/auth/login',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({user_id:id,pin}),
 });
 assert.equal(r.status,201,'Login to restored Hub must authenticate');
 return r.body.token;
}
const count=(db,table)=>db.prepare('SELECT COUNT(*) AS n FROM "'+table+'"').get().n;
function cli(path,mode,...args){
 return spawnSync(process.execPath,[backupCLI,mode,...args],{
  cwd:resolve('.'),env:{...process.env,...env,STORE_DB_PATH:path},
  encoding:'utf8',timeout:20_000,
 });
}
test('Q-12 software rehearsal: live WAL backup restores a fresh HTTP Hub without double cash settlement', {
 timeout:80_000,
},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bmc-restore-process-'));
 const live=join(dir,'live.sqlite');
 const backup=join(dir,'verified-backup.sqlite');
 const restored=join(dir,'spare','rehearsal.sqlite');
 let sourceHub,recoveryHub;
 try{
  const port=await freePort();
  sourceHub=await startHub(live,port);
  const staffToken=await login(sourceHub.base,'staff',env.BOOTSTRAP_STAFF_PIN);
  const cashierToken=await login(sourceHub.base,'cashier',env.BOOTSTRAP_CASHIER_PIN);
  const cat=await call(sourceHub.base,'/v1/catalog',{headers:{Authorization:'Bearer '+staffToken}});
  assert.equal(cat.status,200);
  assert.ok(cat.body.products.some(x=>x.id==='bm-thit'&&x.price_vnd===35000));
  const input={catalog_version:cat.body.version,requested_payment_method:'CASH',
   items:[{product_id:'bm-thit',qty:2,note:'Không hành'}]};
  const first=await post(sourceHub.base,'/v1/orders',staffToken,'rehearsal-order-001',input);
  assert.equal(first.status,201);
  assert.equal(first.body.total_vnd,70000);
  const shift=await post(sourceHub.base,'/v1/cash-shifts/open',cashierToken,
   'rehearsal-shift-001',{opening_float_vnd:250000});
  assert.equal(shift.status,201);
  const captureInput={shift_id:shift.body.id,cash_tendered_vnd:100000,
   expected_order_version:first.body.version};
  const settled=await post(sourceHub.base,
   '/v1/orders/'+first.body.order_id+'/payments/cash',cashierToken,
   'rehearsal-cash-capture-001',captureInput);
  assert.equal(settled.status,201);
  assert.equal(settled.body.cash_net_vnd,70000);
  assert.equal(settled.body.cash_change_vnd,30000);
  const receipts=await call(sourceHub.base,'/v1/orders/'+first.body.order_id+'/receipts',{
   headers:{Authorization:'Bearer '+cashierToken},
  });
  assert.equal(receipts.status,200);
  assert.deepEqual(receipts.body.map(x=>x.kind).sort(),['CUSTOMER','STORE']);

  // CLI runs in a different process while Hub is live and WAL is open.
  const snapshot=cli(live,'backup',backup);
  assert.equal(snapshot.status,0,snapshot.stderr||snapshot.stdout);
  assert.ok(existsSync(backup),'VACUUM INTO must create a standalone backup');
  const check=cli(live,'verify',backup);
  assert.equal(check.status,0,check.stderr||check.stdout);

  // This post-backup order must be absent on the restored copy.
  const later=await post(sourceHub.base,'/v1/orders',staffToken,'rehearsal-after-rpo',input);
  assert.equal(later.status,201);
  assert.notEqual(later.body.order_id,first.body.order_id);

  const copied=cli(live,'restore-copy',backup,restored);
  assert.equal(copied.status,0,copied.stderr||copied.stdout);
  const refused=cli(live,'restore-copy',backup,restored);
  assert.notEqual(refused.status,0,'Restore must never overwrite a previously created target');

  await stopHub(sourceHub.child);
  sourceHub=null;
  const restorePort=await freePort();
  recoveryHub=await startHub(restored,restorePort);
  const freshStaff=await login(recoveryHub.base,'staff',env.BOOTSTRAP_STAFF_PIN);
  const freshCashier=await login(recoveryHub.base,'cashier',env.BOOTSTRAP_CASHIER_PIN);
  const freshOwner=await login(recoveryHub.base,'owner',env.BOOTSTRAP_OWNER_PIN);
  const replay=await post(recoveryHub.base,'/v1/orders',freshStaff,
   'rehearsal-order-001',input);
  assert.equal(replay.status,201);
  assert.equal(replay.body.order_id,first.body.order_id);
  assert.equal(replay.body.display_code,first.body.display_code);
  const captureReplay=await post(recoveryHub.base,
   '/v1/orders/'+first.body.order_id+'/payments/cash',freshCashier,
   'rehearsal-cash-capture-001',captureInput);
  assert.equal(captureReplay.status,201,'Cash retry must return the old settlement ACK');
  assert.deepEqual(captureReplay.body,settled.body,'Same payment ID and receipt batch: no second cash capture');
  const badRetry=await post(recoveryHub.base,
   '/v1/orders/'+first.body.order_id+'/payments/cash',freshCashier,
   'rehearsal-cash-capture-001',{...captureInput,cash_tendered_vnd:150000});
  assert.equal(badRetry.status,409);
  assert.equal(badRetry.body.code,'IDEMPOTENCY_PAYLOAD_MISMATCH');

  const history=await call(recoveryHub.base,'/v1/orders/history?limit=100',{
   headers:{Authorization:'Bearer '+freshOwner},
  });
  assert.equal(history.status,200);
  assert.equal(history.body.items.length,1,'Restore must represent exactly its snapshot RPO boundary');
  assert.equal(history.body.items[0].order_id,first.body.order_id);
  assert.ok(!history.body.items.some(x=>x.order_id===later.body.order_id));
  const copiedReceipts=await call(recoveryHub.base,
   '/v1/orders/'+first.body.order_id+'/receipts',
   {headers:{Authorization:'Bearer '+freshCashier}});
  assert.deepEqual(copiedReceipts.body,receipts.body,
   'Two copy intents and statuses are restored, not recreated');
  const shiftResponse=await call(recoveryHub.base,'/v1/cash-shifts/current',{
   headers:{Authorization:'Bearer '+freshCashier}});
  assert.equal(shiftResponse.body.expected_cash_vnd,320000);

  await stopHub(recoveryHub.child);
  recoveryHub=null;
  const db=new DatabaseSync(restored,{readOnly:true});
  const liveDb=new DatabaseSync(live,{readOnly:true});
  try{
   assert.deepEqual(db.prepare('PRAGMA integrity_check').all(),[{integrity_check:'ok'}]);
   assert.equal(count(db,'orders'),1);
   assert.equal(count(liveDb,'orders'),2);
   assert.equal(count(db,'payments'),1);
   assert.equal(count(db,'receipts'),2);
   assert.equal(count(db,'cash_movements'),2);
   assert.ok(count(db,'sync_outbox')>0);
   assert.equal(db.prepare('SELECT SUM(amount_vnd) total FROM payments').get().total,70000);
   assert.equal(db.prepare("SELECT COUNT(*) n FROM idempotency WHERE scope=? AND key=?")
    .get('capture.cash:'+first.body.order_id,'rehearsal-cash-capture-001').n,1);
  }finally{db.close();liveDb.close()}
  console.log('BMC_RESTORE_HTTP_REHEARSAL '+JSON.stringify({
   snapshotOrders:1,liveOrdersAfterSnapshot:2,
   restoredPayments:1,restoredReceiptIntents:2,restoredCashMovements:2,
   cashNetVnd:70000,openingFloatVnd:250000,expectedCashVnd:320000,
   idempotentCashRetry:true,changedCashRetryRejected:true,
   caveat:'Linux loopback process/SQLite backup rehearsal; post-snapshot orders need manual RPO reconciliation, not Windows power-loss evidence.',
  }));
 }finally{
  if(recoveryHub)await stopHub(recoveryHub.child);
  if(sourceHub)await stopHub(sourceHub.child);
  rmSync(dir,{recursive:true,force:true});
 }
});
