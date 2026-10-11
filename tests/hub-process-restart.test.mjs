import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawn} from 'node:child_process';
import {createServer as createTcpServer} from 'node:net';
import {createServer as createHttpServer} from 'node:http';
import {DatabaseSync} from 'node:sqlite';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {setTimeout as delay} from 'node:timers/promises';

/**
 * Fault injection is performed at an HTTP intermediary after the real Hub
 * returns a committed response. The phone never receives that ACK; then the
 * whole Hub OS process is SIGKILL-ed and restarted from the SAME WAL database.
 * This tests process-boundary recovery, not real power failure or mobile WAN.
 */
async function freeLoopbackPort(){
 const server=createTcpServer();
 await new Promise((resolve,reject)=>{
  server.once('error',reject);
  server.listen(0,'127.0.0.1',resolve);
 });
 const port=server.address().port;
 await new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()));
 return port;
}
async function bootHub(env,port){
 const child=spawn(process.execPath,['apps/store-hub/dist/main.js'],{
  cwd:process.cwd(),env:{...process.env,...env,
   HUB_BIND_HOST:'127.0.0.1',HUB_PORT:String(port),
   CLOUD_SYNC_URL:'',PRINTER_HOST:'',PAIRING_ENFORCED:'0'},
  stdio:['ignore','pipe','pipe'],
 });
 let output='';
 for(const stream of [child.stdout,child.stderr]){
  stream.on('data',data=>{output=(output+data.toString()).slice(-5000)});
 }
 const base='http://127.0.0.1:'+port;
 for(let attempt=0;attempt<80;attempt++){
  if(child.exitCode!==null||child.signalCode!==null)
   throw Error('Store Hub exited before healthy startup: '+output);
  try{
   const result=await fetch(base+'/v1/health',{signal:AbortSignal.timeout(600)});
   if(result.ok)return {child,base};
  }catch{}
  await delay(125);
 }
 await stopHub(child);
 throw Error('Store Hub failed to become healthy: '+output);
}
async function stopHub(child){
 if(!child)return;
 if(child.exitCode!==null||child.signalCode!==null)return;
 const exited=new Promise(resolve=>child.once('exit',resolve));
 assert.ok(child.kill('SIGKILL'),'CI test must stop the real Hub process');
 await Promise.race([exited,delay(5000).then(()=>{throw Error('Hub did not exit after SIGKILL')})]);
}
async function request(base,path,options={}){
 const response=await fetch(base+path,{...options,signal:AbortSignal.timeout(8000)});
 const body=await response.json();
 return {status:response.status,ok:response.ok,body};
}
function post(base,path,token,key,body){
 return request(base,path,{
  method:'POST',headers:{
   'Content-Type':'application/json',
   Authorization:'Bearer '+token,
   'Idempotency-Key':key,
  },body:JSON.stringify(body),
 });
}
async function login(base,user_id,pin){
 const response=await request(base,'/v1/auth/login',{
  method:'POST',headers:{'Content-Type':'application/json'},
  body:JSON.stringify({user_id,pin}),
 });
 assert.ok(response.ok,'Real HTTP login must succeed: '+response.body?.code);
 return response.body.token;
}

test('OR-10d: dropped post-commit HTTP ACK + SIGKILL/restart leaves exactly one durable UNPAID order/outbox event', {
 timeout:70_000,
},async()=>{
 const folder=mkdtempSync(join(tmpdir(),'bmc-process-crash-'));
 const database=join(folder,'store.sqlite');
 const env={
  STORE_DB_PATH:database,SEED_DEMO_CATALOG:'1',
  BOOTSTRAP_OWNER_PIN:'fixture-owner-restart',
  BOOTSTRAP_CASHIER_PIN:'fixture-cashier-restart',
  BOOTSTRAP_STAFF_PIN:'fixture-staff-restart',
 };
 let hub,proxy,db;
 try{
  const port=await freeLoopbackPort();
  hub=await bootHub(env,port);
  const token=await login(hub.base,'staff',env.BOOTSTRAP_STAFF_PIN);
  const catalog=await request(hub.base,'/v1/catalog',{
   headers:{Authorization:'Bearer '+token},
  });
  assert.ok(catalog.ok);
  const orderBody={
   catalog_version:catalog.body.version,
   requested_payment_method:'BANK',
   items:[{product_id:'bm-thit',qty:2,note:'Không hành'}],
   note:'Khách lấy sau',
  };
  const key='process-crash-lost-ack-key-0001';
  let resolveCommit,rejectCommit;
  const upstreamCommit=new Promise((resolve,reject)=>{
   resolveCommit=resolve;rejectCommit=reject;
  });
  // Intentionally do not forward even the response headers to the client.
  proxy=createHttpServer(async(incoming,outgoing)=>{
   try{
    const chunks=[];
    for await(const chunk of incoming)chunks.push(chunk);
    const upstream=await fetch(hub.base+incoming.url,{
     method:incoming.method,
     headers:{
      'Content-Type':incoming.headers['content-type'],
      Authorization:incoming.headers.authorization,
      'Idempotency-Key':incoming.headers['idempotency-key'],
     },
     body:Buffer.concat(chunks),
     signal:AbortSignal.timeout(8000),
    });
    const response=await upstream.json();
    resolveCommit({status:upstream.status,body:response});
    // The Hub has committed; client gets a connection failure, NOT success.
    outgoing.destroy();
   }catch(error){rejectCommit(error);outgoing.destroy()}
  });
  await new Promise((resolve,reject)=>{
   proxy.once('error',reject);
   proxy.listen(0,'127.0.0.1',resolve);
  });
  const proxyPort=proxy.address().port;
  const phoneRequest=post('http://127.0.0.1:'+proxyPort,'/v1/orders',token,key,orderBody);
  const [phoneResult,commitResult]=await Promise.allSettled([phoneRequest,upstreamCommit]);
  assert.equal(phoneResult.status,'rejected','The phone must not receive a fake success ACK');
  assert.equal(commitResult.status,'fulfilled','Upstream really processed the commit');
  assert.equal(commitResult.value.status,201);
  assert.equal(commitResult.value.body.total_vnd,70_000);
  const originalId=commitResult.value.body.order_id;
  const originalCode=commitResult.value.body.display_code;
  assert.ok(originalId&&originalCode);

  await new Promise(resolve=>proxy.close(resolve));
  proxy=null;
  await stopHub(hub.child); // actual process crash, not merely new StoreService()
  hub=null;
  await assert.rejects(
   ()=>post('http://127.0.0.1:'+port,'/v1/orders',token,key,orderBody),
   'Real HTTP request must fail while the Hub is down',
  );

  hub=await bootHub(env,port);
  const freshStaffToken=await login(hub.base,'staff',env.BOOTSTRAP_STAFF_PIN);
  const retry=await post(hub.base,'/v1/orders',freshStaffToken,key,orderBody);
  assert.equal(retry.status,201,'Same command must replay through the restarted HTTP API');
  assert.equal(retry.body.order_id,originalId);
  assert.equal(retry.body.display_code,originalCode);
  assert.equal(retry.body.total_vnd,70_000);
  assert.equal(retry.body.payment_status,'UNPAID');
  assert.equal(retry.body.items[0].unit_price_vnd,35_000);

  const conflict=await post(hub.base,'/v1/orders',freshStaffToken,key,{
   ...orderBody,items:[{product_id:'bm-thit',qty:3}],
  });
  assert.equal(conflict.status,409,'Changed payload cannot reuse original idempotency key');
  assert.equal(conflict.body.code,'IDEMPOTENCY_PAYLOAD_MISMATCH');

  const ownerToken=await login(hub.base,'owner',env.BOOTSTRAP_OWNER_PIN);
  const history=await request(hub.base,'/v1/orders/history?limit=100',{
   headers:{Authorization:'Bearer '+ownerToken},
  });
  assert.equal(history.status,200);
  assert.equal(history.body.items.length,1);
  assert.equal(history.body.items[0].order_id,originalId);
  assert.equal(history.body.items[0].payment_status,'UNPAID');

  await stopHub(hub.child);
  hub=null;
  db=new DatabaseSync(database);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM orders').get().n,1);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM payments').get().n,0);
  assert.equal(db.prepare('SELECT COUNT(*) n FROM receipts').get().n,0);
  assert.equal(db.prepare("SELECT COUNT(*) n FROM idempotency WHERE scope='order.create:staff' AND key=?").get(key).n,1);
  const queued=db.prepare("SELECT payload_json FROM sync_outbox WHERE entity='order'").all();
  assert.equal(queued.length,1,'Outbox event must survive abrupt Hub process termination exactly once');
  assert.equal(JSON.parse(queued[0].payload_json).id,originalId);
  console.log('BMC_HUB_RESTART_RECOVERY '+JSON.stringify({
   processCrash:'SIGKILL',injectedFault:'drop ACK after real upstream HTTP response',
   recovery:'fresh Hub process, same SQLite WAL',orders:1,outboxOrderEvents:1,
   paymentRows:0,receiptRows:0,idempotencyKeyReused:true,
   caveat:'Simulated process crash and proxy ACK loss, NOT real Windows power-loss/WAN or RN app kill.',
  }));
 }finally{
  if(db)db.close();
  if(proxy)await new Promise(resolve=>proxy.close(resolve));
  if(hub)await stopHub(hub.child);
  rmSync(folder,{recursive:true,force:true});
 }
});
