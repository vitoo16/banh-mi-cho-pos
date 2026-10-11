import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

test('340 orders with 230 cash captures never hide an old unpaid cashier order',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bmc-cashier-queue-'));
 const vars=['STORE_DB_PATH','SEED_DEMO_CATALOG','PAIRING_ENFORCED','BOOTSTRAP_OWNER_PIN','BOOTSTRAP_CASHIER_PIN','BOOTSTRAP_STAFF_PIN'];
 const saved=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
 try{
  process.env.STORE_DB_PATH=join(dir,'cashier.sqlite');
  process.env.SEED_DEMO_CATALOG='1';
  delete process.env.PAIRING_ENFORCED;
  process.env.BOOTSTRAP_OWNER_PIN='queue-owner-pin';
  process.env.BOOTSTRAP_CASHIER_PIN='queue-cashier-pin';
  process.env.BOOTSTRAP_STAFF_PIN='queue-staff-pin';
  const {StoreService}=require('../apps/store-hub/dist/service.js');
  const hub=new StoreService();hub.onModuleInit();
  const staff=hub.actor('Bearer '+hub.login('staff',process.env.BOOTSTRAP_STAFF_PIN).token,['STAFF']);
  const cashier=hub.actor('Bearer '+hub.login('cashier',process.env.BOOTSTRAP_CASHIER_PIN).token,['CASHIER']);
  const owner=hub.actor('Bearer '+hub.login('owner',process.env.BOOTSTRAP_OWNER_PIN).token,['OWNER']);
  const sh=hub.openShift(cashier,{opening_float_vnd:500000},'queue-open-shift-001');
  const input={catalog_version:hub.catalog().version,requested_payment_method:'CASH',items:[{product_id:'bm-thit',qty:1}]};
  const created=[];
  for(let i=0;i<340;i++){
   created.push(hub.createOrder(staff,input,'queue-order-'+String(i).padStart(5,'0')));
  }
  // Keep order #0 untouched. Pay 230 newer orders, then simulate a void and a refund.
  for(let i=15;i<245;i++){
   const o=created[i];
   hub.cash(cashier,o.order_id,{shift_id:sh.id,cash_tendered_vnd:50000,expected_order_version:o.version},
    'queue-cash-'+String(i).padStart(5,'0'));
  }
  hub.refundCash(cashier,created[244].order_id,{shift_id:sh.id,reason:'Khách hoàn món'},'queue-refund-one-001');
  hub.voidOrder(cashier,created[339].order_id,{reason:'Khách đổi ý'},'queue-void-one-001');

  const snapshot=hub.orders(cashier);
  const actionable=snapshot.filter(o=>o.status==='COMMITTED'&&['UNPAID','PARTIAL'].includes(o.payment_status));
  const context=snapshot.slice(actionable.length);
  assert.equal(actionable.length,109); // 340 - 230 paid - 1 void
  assert.equal(context.length,200); // bounded recent paid/refunded/voided context
  assert.equal(snapshot.length,309);
  assert.equal(new Set(snapshot.map(o=>o.order_id)).size,snapshot.length);
  assert.ok(actionable.some(o=>o.order_id===created[0].order_id),'oldest unpaid order still in cashier queue');
  assert.ok(!snapshot.some(o=>o.order_id===created[15].order_id),'oldest paid entry may roll out of recent window');
  assert.ok(context.some(o=>o.order_id===created[244].order_id&&o.payment_status==='REFUNDED'));
  assert.ok(context.some(o=>o.order_id===created[339].order_id&&o.status==='VOIDED'));
  assert.ok(actionable.every(o=>o.payment_status!=='REFUNDED'&&o.status!=='VOIDED'));
  assert.ok(actionable.every((o,i)=>i===0||actionable[i-1].created_at<o.created_at||
   actionable[i-1].created_at===o.created_at&&actionable[i-1].order_id<=o.order_id));
  assert.equal(hub.summary().pending_orders,109);
  assert.equal(hub.orders(owner).length,snapshot.length);
  assert.equal(hub.orders(staff).length,100,'STAFF view remains scoped and bounded');
  assert.ok(hub.store.row("SELECT name FROM sqlite_master WHERE type='index' AND name='idx_orders_actionable'"));

  let page=hub.history(cashier,undefined,100),count=page.items.length;
  while(page.next_cursor){page=hub.history(cashier,page.next_cursor,100);count+=page.items.length}
  assert.equal(count,340,'cursor history still contains all paid, voided and pending orders');
  // A new service process against the same WAL must see the same actionable set.
  const reopened=new StoreService();
  assert.equal(reopened.orders(cashier).filter(o=>o.status==='COMMITTED'&&o.payment_status==='UNPAID').length,109);
 }finally{
  for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;
  rmSync(dir,{recursive:true,force:true});
 }
});
