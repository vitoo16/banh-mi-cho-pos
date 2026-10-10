import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('existing SQLite financial history is backfilled atomically once per cloud store and new changes still trigger',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bmc-backfill-'));
 try{
  process.env.STORE_DB_PATH=join(dir,'shop.sqlite');
  process.env.BOOTSTRAP_OWNER_PIN='owner-backfill-passphrase';
  process.env.BOOTSTRAP_CASHIER_PIN='cashier-backfill-passphrase';
  process.env.BOOTSTRAP_STAFF_PIN='staff-backfill-passphrase';
  process.env.SEED_DEMO_CATALOG='1';
  const {StoreService}=require('../apps/store-hub/dist/service.js');
  const svc=new StoreService();svc.onModuleInit();
  const staff=svc.actor('Bearer '+svc.login('staff',process.env.BOOTSTRAP_STAFF_PIN).token,['STAFF']);
  const cashier=svc.actor('Bearer '+svc.login('cashier',process.env.BOOTSTRAP_CASHIER_PIN).token,['CASHIER']);
  const catalog=svc.catalog();
  const order=svc.createOrder(staff,{catalog_version:catalog.version,requested_payment_method:'CASH',items:[{product_id:catalog.products[0].id,qty:1}]},'backfill-order-create-0001');
  const shift=svc.openShift(cashier,{opening_float_vnd:500000},'backfill-open-0001');
  svc.cash(cashier,order.order_id,{shift_id:shift.id,cash_tendered_vnd:100000,expected_order_version:1},'backfill-cash-0001');
  const original=svc.store.row('SELECT COUNT(*) n FROM sync_outbox').n;
  assert.ok(original>=8,'triggers must atomically capture operational events');
  // Emulate upgrading a working pre-cloud store with historic data but without queued events.
  svc.store.run('DELETE FROM sync_outbox');
  assert.equal(svc.store.prepareCloudBackfill('store-main'),8); // 4 products, one order, shift, payment, two drawer entries
  const items=svc.store.all('SELECT entity,payload_json FROM sync_outbox ORDER BY seq');
  assert.deepEqual(items.map(x=>x.entity).sort(),['cash_movement','cash_movement','order','payment','product','product','product','product','shift'].sort());
  assert.ok(items.some(x=>x.entity==='order'&&JSON.parse(x.payload_json).id===order.order_id));
  const total=svc.store.row('SELECT COUNT(*) n FROM sync_outbox').n;
  assert.equal(svc.store.prepareCloudBackfill('store-main'),0);
  assert.equal(svc.store.row('SELECT COUNT(*) n FROM sync_outbox').n,total);
  assert.throws(()=>svc.store.prepareCloudBackfill('invalid store name'),/Invalid CLOUD_STORE_ID/);
  svc.store.run('DELETE FROM sync_outbox');
  assert.equal(svc.store.prepareCloudBackfill('store-main'),0,'do not resend after acknowledged snapshot');
  const future=svc.createOrder(staff,{catalog_version:catalog.version,requested_payment_method:'CASH',items:[{product_id:catalog.products[0].id,qty:1}]},'backfill-future-order-0002');
  assert.equal(svc.store.row('SELECT COUNT(*) n FROM sync_outbox').n,1);
  assert.equal(JSON.parse(svc.store.row('SELECT payload_json FROM sync_outbox').payload_json).id,future.order_id);
 }finally{rmSync(dir,{recursive:true,force:true})}
});
