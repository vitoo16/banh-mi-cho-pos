import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';
import {performance} from 'node:perf_hooks';
import 'reflect-metadata';

const require=createRequire(import.meta.url);
const {NestFactory}=require('@nestjs/core');
const {Module}=require('@nestjs/common');
const {FastifyAdapter}=require('@nestjs/platform-fastify');
const {StoreController}=require('../apps/store-hub/dist/controller.js');
const {StoreService}=require('../apps/store-hub/dist/service.js');

const profile=process.env.BMC_PERF_PROFILE==='burst'?'burst':'smoke';
const volume=profile==='burst'?1500:150;
const concurrentClients=8;
const expectedUnitPrice=35_000;
const envKeys=['STORE_DB_PATH','PAIRING_ENFORCED','SEED_DEMO_CATALOG',
 'BOOTSTRAP_OWNER_PIN','BOOTSTRAP_CASHIER_PIN','BOOTSTRAP_STAFF_PIN'];

const percentile=(sorted,p)=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];
function metrics(samples){
 assert.ok(samples.length>0,'Cannot report percentiles without real HTTP samples');
 const sorted=[...samples].sort((a,b)=>a-b);
 return Object.fromEntries([['p50',.5],['p95',.95],['p99',.99]].map(([key,p])=>[key,
  Math.round(percentile(sorted,p)*100)/100]));
}
async function request(base,path,opts={}){
 const response=await fetch(base+path,{...opts,signal:AbortSignal.timeout(15_000)});
 let body;
 try{body=await response.json()}catch{throw Error('Non-JSON response at '+path+': '+response.status)}
 return {status:response.status,ok:response.ok,body};
}
const authHeaders=token=>({Authorization:'Bearer '+token,'Content-Type':'application/json'});
const post=(base,path,token,key,body)=>request(base,path,{
 method:'POST',
 headers:{...authHeaders(token),'Idempotency-Key':key},
 body:JSON.stringify(body),
});

test('percentile uses nearest-rank over sorted measured latencies',()=>{
 assert.deepEqual(metrics([3,1,4,5,2]),{p50:3,p95:5,p99:5});
});

test('OR-10c: eight distinct STAFF sessions commit real concurrent HTTP orders to SQLite without loss', {
 timeout:profile==='burst'?240_000:120_000,
},async()=>{
 const saved=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
 const folder=mkdtempSync(join(tmpdir(),'bmc-http-perf-'));
 let app;
 let store;
 try{
  process.env.STORE_DB_PATH=join(folder,'isolated.sqlite');
  process.env.SEED_DEMO_CATALOG='1';
  delete process.env.PAIRING_ENFORCED; // Explicitly loopback-only, no simulated LAN trust.
  process.env.BOOTSTRAP_OWNER_PIN='perf-owner-fixture';
  process.env.BOOTSTRAP_CASHIER_PIN='perf-cashier-fixture';
  process.env.BOOTSTRAP_STAFF_PIN='perf-staff-fixture';
  class PerformanceTestModule{}
  Module({controllers:[StoreController],providers:[StoreService]})(PerformanceTestModule);
  app=await NestFactory.create(PerformanceTestModule,new FastifyAdapter({logger:false,bodyLimit:64*1024}),{
   logger:false,
  });
  await app.listen({host:'127.0.0.1',port:0});
  const base=await app.getUrl();
  assert.match(base,/^http:\/\/127\.0\.0\.1:/);
  store=app.get(StoreService);
  const ownerAuth=await request(base,'/v1/auth/login',{
   method:'POST',headers:{'Content-Type':'application/json'},
   body:JSON.stringify({user_id:'owner',pin:'perf-owner-fixture'}),
  });
  assert.ok(ownerAuth.ok,'Owner setup must authorize real HTTP request');
  const ownerToken=ownerAuth.body.token;
  const clientTokens=[];
  for(let i=0;i<concurrentClients;i++){
   const id=i===0?'staff':'perfstaff'+i;
   const pin=i===0?'perf-staff-fixture':'perf-staff-pin-'+i;
   if(i>0){
    const create=await post(base,'/v1/owner/employees',ownerToken,
     'perf-employee-'+i,{id,name:'Nhân viên tải '+i,role:'STAFF',pin});
    assert.ok(create.ok,'Owner must create seven actual staff accounts, not mock identities');
   }
   const logged=await request(base,'/v1/auth/login',{
    method:'POST',headers:{'Content-Type':'application/json'},
    body:JSON.stringify({user_id:id,pin}),
   });
   assert.ok(logged.ok,'Each staff login must authenticate through Fastify');
   clientTokens.push(logged.body.token);
  }
  assert.equal(new Set(clientTokens).size,concurrentClients);
  const catalog=await request(base,'/v1/catalog',{headers:authHeaders(clientTokens[0])});
  assert.ok(catalog.ok);
  assert.ok(catalog.body.products.some(p=>p.id==='bm-thit'&&p.price_vnd===expectedUnitPrice));
  const version=catalog.body.version;
  const created=[];
  const times=[];
  let assigned=0,inFlight=0,peakInFlight=0;
  const wallStart=performance.now();
  await Promise.all(clientTokens.map(async(token)=>{
   while(true){
    const index=assigned++;
    if(index>=volume)return;
    const qty=1+index%3;
    const input={catalog_version:version,requested_payment_method:index%2?'BANK':'CASH',
     items:[{product_id:'bm-thit',qty}]};
    const key='perf-order-'+profile+'-'+String(index).padStart(6,'0');
    const started=performance.now();
    inFlight++;
    peakInFlight=Math.max(peakInFlight,inFlight);
    let result;
    try{result=await post(base,'/v1/orders',token,key,input)}
    finally{inFlight--}
    times.push(performance.now()-started);
    assert.ok(result.ok,'HTTP create failed at '+index+': '+result.status+' '+result.body?.code);
    assert.equal(result.body.total_vnd,expectedUnitPrice*qty,'Hub is price authority');
    assert.equal(result.body.payment_status,'UNPAID','Requested BANK never equals paid BANK');
    assert.equal(result.body.status,'COMMITTED');
    created.push(result.body);
   }
  }));
  const wallMs=performance.now()-wallStart;
  assert.equal(times.length,volume);
  assert.ok(peakInFlight>=2,'Must overlap real HTTP requests, unlike old synchronous loop');
  assert.equal(created.length,volume);
  assert.equal(new Set(created.map(o=>o.order_id)).size,volume,'No accepted order may be lost or duplicated');
  assert.equal(new Set(created.map(o=>o.display_code)).size,volume,'Display codes must be unique');
  const body={catalog_version:version,requested_payment_method:'CASH',
   items:[{product_id:'bm-thit',qty:2}]};
  const retryKey='perf-lost-ack-original-key';
  // Both writes race; the test drops the first ACK locally, then verifies the
  // original idempotency key is safe to retry across separate HTTP requests.
  const [first,duplicate]=await Promise.all([
   post(base,'/v1/orders',clientTokens[0],retryKey,body),
   post(base,'/v1/orders',clientTokens[0],retryKey,body),
  ]);
  assert.ok(first.ok&&duplicate.ok,'Same key/body must be replayable');
  assert.equal(first.body.order_id,duplicate.body.order_id);
  assert.equal(first.body.display_code,duplicate.body.display_code);
  const changed=await post(base,'/v1/orders',clientTokens[0],retryKey,{
   ...body,items:[{product_id:'bm-thit',qty:3}],
  });
  assert.equal(changed.status,409);
  assert.equal(changed.body.code,'IDEMPOTENCY_PAYLOAD_MISMATCH');
  const expected=volume+1;
  const dbOrders=store.store.row('SELECT COUNT(*) AS n FROM orders').n;
  const dbPaid=store.store.row('SELECT COUNT(*) AS n FROM payments').n;
  const receipts=store.store.row('SELECT COUNT(*) AS n FROM receipts').n;
  assert.equal(dbOrders,expected,'SQLite truth must equal successful distinct requests');
  assert.equal(dbPaid,0,'Staff order intent cannot settle CASH or BANK');
  assert.equal(receipts,0,'Unpaid order does not generate a paid receipt');
  let cursor,seen=new Set(),pages=0;
  do{
   const suffix=cursor?'?limit=100&cursor='+encodeURIComponent(cursor):'?limit=100';
   const history=await request(base,'/v1/orders/history'+suffix,{headers:authHeaders(ownerToken)});
   assert.ok(history.ok,'Owner history must page through every accepted order');
   for(const row of history.body.items){
    assert.ok(!seen.has(row.order_id),'No duplicates across cursor pages');
    seen.add(row.order_id);
   }
   cursor=history.body.next_cursor;
   pages++;
   assert.ok(pages<=Math.ceil(expected/100)+2,'Cursor traversal must terminate');
  }while(cursor);
  assert.equal(seen.size,expected,'History must not apply a hidden 300-order cap');
  const report={
   profile,environment:{node:process.versions.node,platform:process.platform,arch:process.arch},
   target:'loopback Fastify HTTP with SQLite WAL, GitHub runner / local host (not real LAN)',
   clientSessions:concurrentClients,acceptedOrders:volume,ackRetryExtraOrder:1,
   peakInFlight,elapsedWallMs:Math.round(wallMs*100)/100,
   throughputOrdersPerSecond:Math.round(volume/(wallMs/1000)*100)/100,
   httpLatencyMs:metrics(times),sqliteOrderRows:dbOrders,sqlitePaymentRows:dbPaid,receiptRows:receipts,
   passedCorrectness:true,
   caveat:'CI timing informational; no real Windows POS, 8 physical phones, LAN, 150/hour pacing, or printer.',
  };
  const directory=resolve('artifacts/perf');
  mkdirSync(directory,{recursive:true});
  writeFileSync(join(directory,'hub-http-'+profile+'.json'),JSON.stringify(report,null,2)+'\n');
  console.log('BMC_HUB_HTTP_PERF '+JSON.stringify(report));
 }finally{
  if(app)await app.close();
  if(store?.store?.db)store.store.db.close();
  for(const [key,value] of Object.entries(saved)){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  rmSync(folder,{recursive:true,force:true});
 }
});
