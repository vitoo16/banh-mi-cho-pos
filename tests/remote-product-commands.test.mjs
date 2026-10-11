import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac,randomUUID} from 'node:crypto';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
const require=createRequire(import.meta.url);

test('remote Owner price command: signed poll, idempotent Hub apply, stale conflicts and eventual mirror',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bmc-remote-price-'));
 const keys=['CLOUD_STORE_ID','CLOUD_SYNC_SECRET','STORE_DB_PATH','SEED_DEMO_CATALOG','PAIRING_ENFORCED','BOOTSTRAP_OWNER_PIN','BOOTSTRAP_CASHIER_PIN','BOOTSTRAP_STAFF_PIN'];
 const saved=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.CLOUD_STORE_ID='ci-remote-price-store';
 process.env.CLOUD_SYNC_SECRET='ci-remote-price-hmac-32-plus-characters';
 process.env.STORE_DB_PATH=join(dir,'hub.sqlite');
 process.env.SEED_DEMO_CATALOG='1';
 delete process.env.PAIRING_ENFORCED;
 process.env.BOOTSTRAP_OWNER_PIN='remote-owner-pin';
 process.env.BOOTSTRAP_CASHIER_PIN='remote-cashier-pin';
 process.env.BOOTSTRAP_STAFF_PIN='remote-staff-pin';
 const {CloudDb}=require('../apps/cloud-api/dist/db.js');
 const {CloudService}=require('../apps/cloud-api/dist/service.js');
 const {RemoteProductCommands}=require('../apps/cloud-api/dist/product-commands.js');
 const {SePayService}=require('../apps/cloud-api/dist/sepay.js');
 const {StoreService}=require('../apps/store-hub/dist/service.js');
 const db=new CloudDb();
 try{
  await db.onModuleInit();
  await db.pool.query('TRUNCATE remote_product_commands,mirror_products,synced_events');
  const cloud=new CloudService(db,new SePayService(db));
  const commands=new RemoteProductCommands(db);
  const hub=new StoreService();hub.onModuleInit();
  const owner=hub.actor('Bearer '+hub.login('owner',process.env.BOOTSTRAP_OWNER_PIN).token,['OWNER']);
  const staff=hub.actor('Bearer '+hub.login('staff',process.env.BOOTSTRAP_STAFF_PIN).token,['STAFF']);
  const catalog=hub.catalog();
  const order=hub.createOrder(staff,{
   catalog_version:catalog.version,requested_payment_method:'CASH',
   items:[{product_id:'bm-thit',qty:1}]
  },'remote-price-old-order-001');
  assert.equal(order.total_vnd,35000);
  await db.pool.query('INSERT INTO mirror_products(store_id,id,name,category,price_vnd,is_active) VALUES($1,$2,$3,$4,$5,$6)',
   [process.env.CLOUD_STORE_ID,'bm-thit','Bánh mì thịt nguội','Bánh mì',35000,true]);
  const body={name:'Bánh mì thịt nguội mới',price_vnd:39000,is_active:true,expected_price_vnd:35000};
  const key='remote-product-update-0001';
  const queued=await commands.enqueue('bm-thit',body,key);
  assert.equal(queued.status,'PENDING');
  assert.deepEqual(await commands.enqueue('bm-thit',body,key),queued);
  await assert.rejects(()=>commands.enqueue('bm-thit',{...body,price_vnd:40000},key),e=>e.status===409);
  await assert.rejects(()=>commands.enqueue('missing-product',body,'new-queue-key-02'),e=>e.status===404);
  const stamp=String(Date.now()),sign=s=>createHmac('sha256',process.env.CLOUD_SYNC_SECRET).update(stamp+'.'+s).digest('hex');
  await assert.rejects(()=>commands.poll(process.env.CLOUD_STORE_ID,stamp,'0'.repeat(64)),e=>e.status===401);
  await assert.rejects(()=>commands.poll('other-store',stamp,sign('GET:product-commands')),e=>e.status===401);
  const envelope=await commands.poll(process.env.CLOUD_STORE_ID,stamp,sign('GET:product-commands'));
  assert.equal(envelope.payload.store_id,process.env.CLOUD_STORE_ID);
  assert.equal(envelope.payload.commands.length,1);
  const responseMac=createHmac('sha256',process.env.CLOUD_SYNC_SECRET).update(envelope.timestamp+'.'+JSON.stringify(envelope.payload)).digest('hex');
  assert.equal(envelope.signature,responseMac);
  const cmd=envelope.payload.commands[0];
  const applied=hub.applyRemoteProductCommand(cmd);
  assert.equal(applied.price_vnd,39000);
  assert.deepEqual(hub.applyRemoteProductCommand(cmd),applied,'retry after lost ACK cannot bump catalog twice');
  assert.equal(hub.catalog().version,catalog.version+1);
  assert.equal(hub.order(staff,order.order_id).items[0].unit_price_vnd,35000,'old paid or unpaid order retains price snapshot');
  assert.equal(hub.store.row("SELECT COUNT(*) n FROM audit WHERE kind='PRODUCT_UPDATE' AND actor_id='cloud-owner'").n,1);
  assert.equal((await commands.list())[0].status,'PENDING','without signed ACK Cloud must not claim applied');
  const results=[{id:cmd.id,status:'APPLIED',result_code:'OK'}],signedBody=JSON.stringify({results});
  await assert.rejects(()=>commands.acknowledge({results},stamp,'bad',process.env.CLOUD_STORE_ID),e=>e.status===401);
  assert.deepEqual((await commands.acknowledge({results},stamp,sign(signedBody),process.env.CLOUD_STORE_ID)).accepted,[cmd.id]);
  assert.deepEqual((await commands.acknowledge({results},stamp,sign(signedBody),process.env.CLOUD_STORE_ID)).accepted,[cmd.id]);
  assert.equal((await commands.list())[0].status,'APPLIED');
  const event=hub.store.all("SELECT id,entity,payload_json FROM sync_outbox WHERE entity='product' ORDER BY seq DESC LIMIT 1")[0];
  assert.ok(event);
  const replicated=[{id:event.id,entity:event.entity,payload:JSON.parse(event.payload_json)}];
  assert.equal((await cloud.products()).products[0].price_vnd,35000,'mirror remains stale until local outbox delivered');
  assert.equal((await cloud.ingest(replicated,stamp,sign(JSON.stringify({events:replicated})),process.env.CLOUD_STORE_ID)).received[0],event.id);
  assert.equal((await cloud.products()).products[0].price_vnd,39000);

  // An old cloud tab can queue stale price expectation; Hub rejects without changing price.
  const conflictBody={...body,price_vnd:45000,expected_price_vnd:35000};
  const oldTab=await commands.enqueue('bm-thit',conflictBody,'stale-tab-remote-update-002');
  const conflicting=(await commands.poll(process.env.CLOUD_STORE_ID,stamp,sign('GET:product-commands'))).payload.commands.find(x=>x.id===oldTab.id);
  assert.ok(conflicting);
  assert.throws(()=>hub.applyRemoteProductCommand(conflicting),e=>e.code==='PRICE_CHANGED');
  const conflictAck=[{id:conflicting.id,status:'CONFLICT',result_code:'PRICE_CHANGED'}];
  const badBody=JSON.stringify({results:conflictAck});
  await commands.acknowledge({results:conflictAck},stamp,sign(badBody),process.env.CLOUD_STORE_ID);
  assert.equal((await commands.list()).find(x=>x.id===oldTab.id).status,'CONFLICT');
  assert.equal(hub.catalog().products.find(x=>x.id==='bm-thit').price_vnd,39000);
  await assert.rejects(()=>commands.acknowledge({results:[{id:conflicting.id,status:'APPLIED',result_code:'OK'}]},
   stamp,sign(JSON.stringify({results:[{id:conflicting.id,status:'APPLIED',result_code:'OK'}]})),
   process.env.CLOUD_STORE_ID),e=>e.status===409);

  // One more local owner price edit proves pending remote commands must compare the live POS price.
  hub.updateProduct(owner,'bm-thit',{name:'Tên mới',price_vnd:41000,is_active:true},'owner-local-price-001');
  assert.equal(hub.catalog().products.find(x=>x.id==='bm-thit').price_vnd,41000);
 }finally{
  await db.onModuleDestroy();
  for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;
  rmSync(dir,{recursive:true,force:true});
 }
});
