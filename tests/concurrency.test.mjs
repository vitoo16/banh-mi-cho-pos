import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('8 staff clients and 150 order commits retain unique codes and totals',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bmc-concurrent-'));
 try{
  process.env.STORE_DB_PATH=join(dir,'shop.sqlite');
  process.env.BOOTSTRAP_OWNER_PIN='owner-secure-test';process.env.BOOTSTRAP_CASHIER_PIN='cashier-secure-test';process.env.BOOTSTRAP_STAFF_PIN='staff-secure-test';
  process.env.SEED_DEMO_CATALOG='1';
  const {StoreService}=require('../apps/store-hub/dist/service.js');
  const main=new StoreService();main.onModuleInit();
  const owner=main.actor('Bearer '+main.login('owner','owner-secure-test').token,['OWNER']);
  for(let i=1;i<8;i++)main.addEmployee(owner,{id:'staff'+i,name:'Nhân viên '+i,role:'STAFF',pin:'staff-login-'+i},'employee-create-'+i);
  const instances=Array.from({length:8},()=>new StoreService());
  const actors=instances.map((s,i)=>s.actor('Bearer '+s.login(i===0?'staff':'staff'+i,i===0?'staff-secure-test':'staff-login-'+i).token,['STAFF']));
  const times=[];const results=[];const version=main.catalog().version;
  for(let i=0;i<150;i++){
   const idx=i%8,start=performance.now();
   const order=instances[idx].createOrder(actors[idx],{catalog_version:version,requested_payment_method:i%2===0?'CASH':'BANK',items:[{product_id:'bm-thit',qty:1+(i%3)}]},'stress-order-'+String(i).padStart(5,'0'));
   results.push(order);times.push(performance.now()-start);
  }
  assert.equal(new Set(results.map(x=>x.order_id)).size,150);
  assert.equal(new Set(results.map(x=>x.display_code)).size,150);
  assert.ok(results.every(x=>x.total_vnd===35000*x.items[0].qty));
  assert.ok(results.every(x=>x.payment_status==='UNPAID'));
  const first=main.history(owner,undefined,100);
  assert.equal(first.items.length,100);
  assert.ok(first.next_cursor);
  const second=main.history(owner,first.next_cursor,100);
  assert.equal(second.items.length,50);
  assert.equal(second.next_cursor,null);
  assert.equal(new Set([...first.items,...second.items].map(x=>x.order_id)).size,150);
  assert.throws(()=>main.history(owner,'garbage',100),e=>e.code==='INVALID_CURSOR');
  const p95=[...times].sort((a,b)=>a-b)[Math.floor(times.length*.95)];
  console.log('8-client 150 order API sequential-arrival smoke P95(ms):',p95.toFixed(2));
  // Does NOT certify HTTP/network/concurrent 150 orders/hr target. Real device+WAN/LAN load gate is separate.
 }finally{rmSync(dir,{recursive:true,force:true})}
});
