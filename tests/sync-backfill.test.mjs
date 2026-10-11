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
  assert.equal(svc.store.prepareCloudBackfill('store-main'),9); // 4 products, one order, shift, payment, two drawer entries
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

test('Hub transmits signed positive monotonic SQLite outbox sequences, not just opaque event IDs',async()=>{
 const {createHmac}=await import('node:crypto');
 const dir=mkdtempSync(join(tmpdir(),'bmc-outbox-seq-'));
 const keys=['STORE_DB_PATH','SEED_DEMO_CATALOG','BOOTSTRAP_OWNER_PIN','BOOTSTRAP_CASHIER_PIN','BOOTSTRAP_STAFF_PIN','CLOUD_SYNC_URL','CLOUD_SYNC_SECRET','CLOUD_STORE_ID'];
 const previous=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 const originalFetch=globalThis.fetch;
 try{
  process.env.STORE_DB_PATH=join(dir,'shop.sqlite');
  process.env.SEED_DEMO_CATALOG='1';
  process.env.BOOTSTRAP_OWNER_PIN='hub-seq-owner-secure';
  process.env.BOOTSTRAP_CASHIER_PIN='hub-seq-cashier-secure';
  process.env.BOOTSTRAP_STAFF_PIN='hub-seq-staff-secure';
  process.env.CLOUD_SYNC_URL='https://example.invalid';
  process.env.CLOUD_SYNC_SECRET='hub-seq-verified-32-plus-char-secret';
  process.env.CLOUD_STORE_ID='ci-hub-outbox-seq-store';
  const {StoreService}=require('../apps/store-hub/dist/service.js');
  const {CloudSyncWorker}=require('../apps/store-hub/dist/sync.js');
  const hub=new StoreService();hub.onModuleInit();
  const actor=hub.actor('Bearer '+hub.login('owner',process.env.BOOTSTRAP_OWNER_PIN).token,['OWNER']);
  hub.updateProduct(actor,'bm-thit',{name:'Món giá mới',price_vnd:44000,is_active:false},'hub-seq-update-prod-key');
  const rows=hub.store.all('SELECT seq,id,entity,payload_json FROM sync_outbox ORDER BY seq');
  assert.ok(rows.length>=5);
  let calls=0;
  globalThis.fetch=async(url,options)=>{
   calls++;
   assert.equal(String(url),'https://example.invalid/v1/sync/events');
   const body=JSON.parse(options.body),events=body.events;
   assert.equal(events.length,rows.length);
   assert.deepEqual(events.map(e=>e.seq),rows.map(r=>r.seq));
   assert.deepEqual(events.map(e=>e.id),rows.map(r=>r.id));
   assert.ok(events.every(e=>Number.isSafeInteger(e.seq)&&e.seq>0));
   const {['x-bmc-timestamp']:stamp,['x-bmc-signature']:signature}=options.headers;
   const signed=createHmac('sha256',process.env.CLOUD_SYNC_SECRET).update(stamp+'.'+options.body).digest('hex');
   assert.equal(signature,signed,'signed JSON must cover source sequence');
   return new Response(JSON.stringify({received:events.map(x=>x.id)}),{status:200,headers:{'content-type':'application/json'}});
  };
  const worker=new CloudSyncWorker(hub);
  await worker.flush();
  assert.equal(calls,1);
  assert.equal(hub.store.row('SELECT COUNT(*) n FROM sync_outbox WHERE delivered_at IS NULL').n,0);
 }finally{
  globalThis.fetch=originalFetch;
  for(const [key,value] of Object.entries(previous))
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  rmSync(dir,{recursive:true,force:true});
 }
});
