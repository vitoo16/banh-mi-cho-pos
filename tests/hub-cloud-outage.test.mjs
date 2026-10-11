import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createServer} from 'node:http';
import {createHmac} from 'node:crypto';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);

test('OR-10e: Cloud connection loss cannot stop local orders, CASH and queued outbox recovery', {
 timeout:40_000,
},async()=>{
 const folder=mkdtempSync(join(tmpdir(),'bmc-cloud-outage-'));
 const keys=[
  'STORE_DB_PATH','SEED_DEMO_CATALOG','BOOTSTRAP_OWNER_PIN',
  'BOOTSTRAP_CASHIER_PIN','BOOTSTRAP_STAFF_PIN',
  'CLOUD_SYNC_URL','CLOUD_SYNC_SECRET','CLOUD_STORE_ID',
  'ENABLE_VERIFIED_BANK_INBOX','PRINTER_HOST',
 ];
 const previous=Object.fromEntries(keys.map(key=>[key,process.env[key]]));
 let cloud,db;
 try{
  process.env.STORE_DB_PATH=join(folder,'store.sqlite');
  process.env.SEED_DEMO_CATALOG='1';
  process.env.BOOTSTRAP_OWNER_PIN='offline-owner-pin';
  process.env.BOOTSTRAP_CASHIER_PIN='offline-cashier-pin';
  process.env.BOOTSTRAP_STAFF_PIN='offline-staff-pin';
  process.env.CLOUD_SYNC_SECRET='integration-test-cloud-secret-at-least-32-chars';
  process.env.CLOUD_STORE_ID='qa-offline-local-store';
  delete process.env.ENABLE_VERIFIED_BANK_INBOX;
  delete process.env.PRINTER_HOST;
  let connected=false,attempts=0,delivered=0;
  const cloudErrors=[];
  cloud=createServer(async(req,res)=>{
   attempts++;
   if(!connected){
    // Model a mid-request transport failure rather than a Cloud 200 ACK.
    req.socket.destroy();
    return;
   }
   try{
    assert.equal(req.method,'POST');
    assert.equal(req.url,'/v1/sync/events');
    const chunks=[];
    for await(const data of req)chunks.push(data);
    const raw=Buffer.concat(chunks).toString('utf8');
    const stamp=req.headers['x-bmc-timestamp'];
    const signature=createHmac('sha256',process.env.CLOUD_SYNC_SECRET)
     .update(stamp+'.'+raw).digest('hex');
    assert.equal(req.headers['x-bmc-signature'],signature);
    assert.equal(req.headers['x-bmc-store'],process.env.CLOUD_STORE_ID);
    const events=JSON.parse(raw).events;
    assert.ok(events.length>0&&events.length<=75);
    assert.ok(events.every((event,index)=>
     Number.isSafeInteger(event.seq)&&event.seq>0&&
      (index===0||event.seq>events[index-1].seq)));
    delivered+=events.length;
    res.writeHead(200,{'Content-Type':'application/json'});
    res.end(JSON.stringify({received:events.map(event=>event.id)}));
   }catch(error){
    cloudErrors.push(String(error));
    res.writeHead(500,{'Content-Type':'application/json'});
    res.end(JSON.stringify({error:'INVALID_SIGNED_BATCH'}));
   }
  });
  await new Promise((resolve,reject)=>{
   cloud.once('error',reject);
   cloud.listen(0,'127.0.0.1',resolve);
  });
  process.env.CLOUD_SYNC_URL='http://127.0.0.1:'+cloud.address().port;

  const {StoreService}=require('../apps/store-hub/dist/service.js');
  const {CloudSyncWorker}=require('../apps/store-hub/dist/sync.js');
  const hub=new StoreService();
  hub.onModuleInit();
  db=hub.store;
  const staff=hub.actor('Bearer '+hub.login('staff',process.env.BOOTSTRAP_STAFF_PIN).token,['STAFF']);
  const cashier=hub.actor('Bearer '+hub.login('cashier',process.env.BOOTSTRAP_CASHIER_PIN).token,['CASHIER']);
  const initial=hub.catalog();
  const shift=hub.openShift(cashier,{opening_float_vnd:400_000},'offline-open-shift-001');

  const cashOrder=hub.createOrder(staff,{
   catalog_version:initial.version,requested_payment_method:'CASH',
   items:[{product_id:'bm-thit',qty:2}],
  },'offline-cash-order-001');
  const worker=new CloudSyncWorker(hub);
  await assert.rejects(worker.flush(),'Outbox send must fail on broken Cloud transport');
  const pendingBefore=db.row('SELECT COUNT(*) AS n FROM sync_outbox WHERE delivered_at IS NULL').n;
  assert.ok(pendingBefore>0,'No event may be acknowledged during Cloud outage');
  assert.equal(hub.operationalStatus(cashier).cloud_sync.last_delivered_at,null);

  // An unreachable Cloud cannot prevent this shop-local CASH capture.
  const capture=hub.cash(cashier,cashOrder.order_id,{
   shift_id:shift.id,cash_tendered_vnd:100_000,expected_order_version:cashOrder.version,
  },'offline-cash-capture-001');
  assert.equal(capture.cash_net_vnd,70_000);
  assert.equal(capture.cash_change_vnd,30_000);
  assert.equal(hub.receipts(cashier,cashOrder.order_id).length,2);

  const bankOrder=hub.createOrder(staff,{
   catalog_version:initial.version,requested_payment_method:'BANK',
   items:[{product_id:'bm-dacbiet',qty:1}],
  },'offline-bank-order-001');
  assert.equal(bankOrder.payment_status,'UNPAID');
  assert.equal(hub.order(staff,bankOrder.order_id).payment_status,'UNPAID');
  await assert.rejects(worker.flush(),'Reattempt during outage cannot clear outbox');
  const pendingDuring=db.row('SELECT COUNT(*) AS n FROM sync_outbox WHERE delivered_at IS NULL').n;
  assert.ok(pendingDuring>pendingBefore,'Cash capture and new order must enqueue durable events');
  assert.equal(hub.summary().cash_vnd,70_000);
  assert.equal(hub.summary().bank_vnd,0,'Requested BANK is not confirmed BANK');
  assert.equal(hub.currentShift().expected_cash_vnd,470_000);
  assert.equal(db.row('SELECT COUNT(*) AS n FROM payments').n,1);
  assert.equal(db.row('SELECT COUNT(*) AS n FROM receipts').n,2);
  assert.equal(hub.operationalStatus(cashier).cloud_sync.last_delivered_at,null);
  assert.equal(hub.operationalStatus(cashier).cloud_sync.pending_events,pendingDuring);

  connected=true;
  await worker.flush();
  assert.deepEqual(cloudErrors,[],'Cloud batch must remain correctly authenticated');
  assert.equal(delivered,pendingDuring);
  assert.equal(db.row('SELECT COUNT(*) AS n FROM sync_outbox WHERE delivered_at IS NULL').n,0);
  const status=hub.operationalStatus(cashier);
  assert.ok(status.cloud_sync.last_delivered_at,'Only a real signed ACK may set last synced');
  assert.equal(status.cloud_sync.pending_events,0);
  assert.equal(hub.order(staff,bankOrder.order_id).payment_status,'UNPAID');
  assert.equal(hub.summary().cash_vnd,70_000);
  assert.equal(hub.summary().bank_vnd,0);
  await worker.flush();
  assert.equal(delivered,pendingDuring,'Cloud recovery may not resend acknowledged events');
  assert.equal(db.row('SELECT COUNT(*) AS n FROM payments').n,1);
  assert.equal(db.row('SELECT COUNT(*) AS n FROM receipts').n,2);
  console.log('BMC_CLOUD_OFFLINE_RECOVERY '+JSON.stringify({
   simulatedFailure:'Cloud HTTP transport disconnected',failedSyncAttempts:attempts-1,
   queuedBeforeRecovery:pendingDuring,acknowledgedEvents:delivered,
   localCashNetVnd:70_000,bankOrderStatus:'UNPAID',paymentRows:1,receiptIntents:2,
   cloudPendingAfterRecovery:0,
   caveat:'Test-only loopback Cloud transport, not 30-minute physical WAN outage or ESC/POS hardware printing.',
  }));
 }finally{
  if(db?.db)db.db.close();
  if(cloud)await new Promise(resolve=>cloud.close(resolve));
  for(const [key,value] of Object.entries(previous)){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  rmSync(folder,{recursive:true,force:true});
 }
});
