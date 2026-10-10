import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

test('cashier status exposes durable print UNKNOWN and truthful cloud sync, excluding Staff',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bmc-ops-'));
 const original={db:process.env.STORE_DB_PATH,seed:process.env.SEED_DEMO_CATALOG,cloud:process.env.CLOUD_SYNC_URL,printer:process.env.PRINTER_HOST};
 try{
  process.env.STORE_DB_PATH=join(dir,'store.sqlite');
  process.env.SEED_DEMO_CATALOG='1';
  delete process.env.CLOUD_SYNC_URL;
  delete process.env.PRINTER_HOST;
  process.env.BOOTSTRAP_OWNER_PIN='test-ops-owner-secret';
  process.env.BOOTSTRAP_CASHIER_PIN='test-ops-cashier-secret';
  process.env.BOOTSTRAP_STAFF_PIN='test-ops-staff-secret';
  const {StoreService}=require('../apps/store-hub/dist/service.js');
  const svc=new StoreService();svc.onModuleInit();
  const staff=svc.actor('Bearer '+svc.login('staff',process.env.BOOTSTRAP_STAFF_PIN).token,['STAFF']);
  const cashier=svc.actor('Bearer '+svc.login('cashier',process.env.BOOTSTRAP_CASHIER_PIN).token,['CASHIER']);
  const owner=svc.actor('Bearer '+svc.login('owner',process.env.BOOTSTRAP_OWNER_PIN).token,['OWNER']);
  assert.throws(()=>svc.operationalStatus(staff),e=>e.code==='FORBIDDEN');
  const initial=svc.operationalStatus(cashier);
  assert.equal(initial.printer.waiting_copies,0);
  assert.equal(initial.printer.unknown_copies,0);
  assert.equal(initial.printer.driver_configured,false);
  assert.equal(initial.cloud_sync.configured,false);
  assert.equal(initial.cloud_sync.last_delivered_at,null);
  assert.equal(svc.summary().last_synced_at,null,'local Owner must not claim sync when Cloud is disabled');

  const catalog=svc.catalog();
  const order=svc.createOrder(staff,{catalog_version:catalog.version,requested_payment_method:'CASH',
   items:[{product_id:catalog.products[0].id,qty:1}]},'ops-order-0001');
  const shift=svc.openShift(cashier,{opening_float_vnd:100000},'ops-shift-0001');
  svc.cash(cashier,order.order_id,{shift_id:shift.id,cash_tendered_vnd:100000,expected_order_version:order.version},'ops-cash-0001');
  const ready=svc.operationalStatus(owner);
  assert.equal(ready.printer.waiting_copies,2);
  assert.equal(ready.printer.unknown_copies,0);
  assert.ok(ready.cloud_sync.pending_events>0);
  assert.equal(ready.cloud_sync.last_delivered_at,null);
  const copies=svc.receipts(cashier,order.order_id);
  svc.store.run("UPDATE receipts SET status='UNKNOWN',attempts=attempts+1 WHERE id=?",copies[0].id);
  const warning=svc.operationalStatus(cashier);
  assert.equal(warning.printer.waiting_copies,1);
  assert.equal(warning.printer.unknown_copies,1);
  assert.equal(warning.printer.unknown_receipts[0].order_id,order.order_id);
  assert.equal(warning.printer.unknown_receipts[0].id,copies[0].id);
  assert.equal(warning.printer.unknown_receipts[0].display_code,order.display_code);
  assert.equal(warning.printer.unknown_receipts[0].attempts,1);

  process.env.CLOUD_SYNC_URL='https://cloud.example.invalid';
  assert.equal(svc.operationalStatus(cashier).cloud_sync.last_delivered_at,null,'configured != delivered');
  assert.equal(svc.summary().last_synced_at,null);
  const delivered='2026-10-10T19:21:00.000Z';
  svc.store.run('UPDATE sync_outbox SET delivered_at=? WHERE delivered_at IS NULL',delivered);
  const observed=svc.operationalStatus(cashier);
  assert.equal(observed.cloud_sync.configured,true);
  assert.equal(observed.cloud_sync.pending_events,0);
  assert.equal(observed.cloud_sync.last_delivered_at,delivered);
  assert.equal(svc.summary().last_synced_at,delivered);
  svc.store.run("UPDATE receipts SET status='SENT' WHERE id=?",copies[0].id);
  assert.equal(svc.operationalStatus(cashier).printer.unknown_copies,0);
 }finally{
  for(const [key,value] of Object.entries({STORE_DB_PATH:original.db,SEED_DEMO_CATALOG:original.seed,CLOUD_SYNC_URL:original.cloud,PRINTER_HOST:original.printer})){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  rmSync(dir,{recursive:true,force:true});
 }
});
