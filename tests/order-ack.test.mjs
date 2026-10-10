import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

test('lost create-order ACK: same durable key after restart produces one order and unchanged price snapshot',()=>{
 const folder=mkdtempSync(join(tmpdir(),'bmc-ack-'));
 const original={path:process.env.STORE_DB_PATH,pair:process.env.PAIRING_ENFORCED};
 try{
  process.env.STORE_DB_PATH=join(folder,'hub.sqlite');
  delete process.env.PAIRING_ENFORCED;
  process.env.BOOTSTRAP_OWNER_PIN='owner-test-secret';
  process.env.BOOTSTRAP_CASHIER_PIN='cashier-test-secret';
  process.env.BOOTSTRAP_STAFF_PIN='staff-test-secret';
  process.env.SEED_DEMO_CATALOG='1';
  const {StoreService}=require('../apps/store-hub/dist/service.js');
  const hubA=new StoreService();hubA.onModuleInit();
  const staff=hubA.actor('Bearer '+hubA.login('staff','staff-test-secret').token,['STAFF']);
  const p=hubA.catalog().products.find(x=>x.id==='bm-thit');
  assert.ok(p);
  const input={catalog_version:hubA.catalog().version,requested_payment_method:'BANK',items:[{product_id:p.id,qty:2,note:'Không hành'}],note:'Khách lấy sau'};
  const stableKey='ack-lost-before-phone-closed-001';
  hubA.createOrder(staff,input,stableKey); // success persisted, reply lost before phone can read
  const hubB=new StoreService(); // store reopened after simulated phone + service restarts
  const again=hubB.createOrder(staff,input,stableKey);
  assert.equal(again.payment_status,'UNPAID');
  assert.equal(again.total_vnd,70000);
  assert.equal(again.items[0].unit_price_vnd,35000);
  assert.equal(hubB.store.row('SELECT COUNT(*) n FROM orders').n,1);
  const cashier=hubB.actor('Bearer '+hubB.login('cashier','cashier-test-secret').token,['CASHIER']);
  const shift=hubB.openShift(cashier,{opening_float_vnd:250000},'shift-ack-001');
  const received=hubB.cash(cashier,again.order_id,{shift_id:shift.id,cash_tendered_vnd:100000,expected_order_version:again.version},'ack-cash-001');
  assert.equal(received.cash_net_vnd,70000);
  assert.deepEqual(hubB.cash(cashier,again.order_id,{shift_id:shift.id,cash_tendered_vnd:100000,expected_order_version:again.version},'ack-cash-001'),received);
  assert.equal(hubB.receipts(cashier,again.order_id).length,2);
  assert.equal(hubB.store.row('SELECT COUNT(*) n FROM payments').n,1);
 }finally{
  if(original.path===undefined)delete process.env.STORE_DB_PATH;else process.env.STORE_DB_PATH=original.path;
  if(original.pair===undefined)delete process.env.PAIRING_ENFORCED;else process.env.PAIRING_ENFORCED=original.pair;
  rmSync(folder,{recursive:true,force:true});
 }
});
