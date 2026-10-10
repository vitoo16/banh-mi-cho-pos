import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
const require=createRequire(import.meta.url);
const mac=(key,data)=>createHmac('sha256',key).update(data).digest('hex');

test('SePay raw HMAC to cloud settlement to verified local cash desk, no duplicates',async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bmc-sepay-'));
 process.env.CLOUD_STORE_ID='test-sepay-store';
 process.env.CLOUD_SYNC_SECRET='test-cloud-sync-32-random-characters-abcd';
 process.env.BANK_BRIDGE_SECRET='test-internal-bank-bridge-32-secret-abc';
 process.env.BANK_ACCOUNT_NUMBER='1017588888';
 process.env.BANK_CODE='Vietcombank';
 process.env.SEPAY_ACCOUNT_NUMBER='1017588888';
 process.env.SEPAY_BANK_GATEWAY='Vietcombank';
 process.env.SEPAY_WEBHOOK_SECRET='test-sepay-whsec-32-random-characters';
 process.env.STORE_DB_PATH=join(dir,'shop.sqlite');
 process.env.BOOTSTRAP_OWNER_PIN='owner-test-sepay-strong';
 process.env.BOOTSTRAP_CASHIER_PIN='cashier-test-sepay-strong';
 process.env.BOOTSTRAP_STAFF_PIN='staff-test-sepay-strong';
 process.env.SEED_DEMO_CATALOG='1';
 const {CloudDb}=require('../apps/cloud-api/dist/db.js');
 const {CloudService}=require('../apps/cloud-api/dist/service.js');
 const {SePayService}=require('../apps/cloud-api/dist/sepay.js');
 const {StoreService}=require('../apps/store-hub/dist/service.js');
 const db=new CloudDb();await db.onModuleInit();
 try{
  const sepay=new SePayService(db),cloud=new CloudService(db,sepay);
  const local=new StoreService();local.onModuleInit();
  const staff=local.actor('Bearer '+local.login('staff',process.env.BOOTSTRAP_STAFF_PIN).token,['STAFF']);
  const cashier=local.actor('Bearer '+local.login('cashier',process.env.BOOTSTRAP_CASHIER_PIN).token,['CASHIER']);
  const catalog=local.catalog();
  const order=local.createOrder(staff,{catalog_version:catalog.version,requested_payment_method:'BANK',items:[{product_id:catalog.products[0].id,qty:1}]},'sepay-order-0001');
  const intent=local.bankIntent(cashier,order.order_id,'sepay-intent-0001');
  assert.equal(intent.status,'PENDING');
  const selected=local.store.all("SELECT id,entity,payload_json FROM sync_outbox WHERE entity IN ('order','bank_intent') ORDER BY seq");
  const events=selected.map(x=>({id:x.id,entity:x.entity,payload:JSON.parse(x.payload_json)}));
  const ms=String(Date.now()),csig=mac(process.env.CLOUD_SYNC_SECRET,ms+'.'+JSON.stringify({events}));
  assert.deepEqual((await cloud.ingest(events,ms,csig,process.env.CLOUD_STORE_ID)).received,events.map(x=>x.id));
  const rawBase={id:92704,gateway:'Vietcombank',transactionDate:'2026-10-11 10:00:00',accountNumber:'1017588888',
   subAccount:'',code:intent.reference,content:intent.reference+' chuyen tien',transferType:'in',
   description:'KHACH CHUYEN TIEN',transferAmount:order.total_vnd,accumulated:10500000,referenceCode:'FT-TEST-92704'};
  const sec=String(Math.floor(Date.now()/1000));
  const sign=(payload,stamp=sec)=>'sha256='+mac(process.env.SEPAY_WEBHOOK_SECRET,stamp+'.'+payload);
  const body='  '+JSON.stringify(rawBase)+'\n'; // preserve original whitespace in the HMAC test
  await assert.rejects(()=>sepay.receiveWebhook(Buffer.from(body),sec,sign(JSON.stringify(rawBase))),e=>e.status===401);
  await assert.rejects(()=>sepay.receiveWebhook(Buffer.from(body),String(Number(sec)-3600),sign(body,String(Number(sec)-3600))),e=>e.status===401);
  const wrong={...rawBase,id:92705,transferAmount:order.total_vnd-1000};
  await sepay.receiveWebhook(Buffer.from(JSON.stringify(wrong)),sec,sign(JSON.stringify(wrong)));
  const wrongReceiver={...rawBase,id:92706,accountNumber:'0000000000'};
  await sepay.receiveWebhook(Buffer.from(JSON.stringify(wrongReceiver)),sec,sign(JSON.stringify(wrongReceiver)));
  const count=await db.pool.query("SELECT COUNT(*) n FROM cloud_bank_settlements WHERE store_id=$1",[process.env.CLOUD_STORE_ID]);
  assert.equal(Number(count.rows[0].n),0);
  assert.equal((await cloud.summary()).bank_vnd,0);
  assert.deepEqual(await sepay.receiveWebhook(Buffer.from(body),sec,sign(body)),{success:true});
  assert.deepEqual(await sepay.receiveWebhook(Buffer.from(body),sec,sign(body)),{success:true});
  const settled=await db.pool.query("SELECT COUNT(*) n FROM cloud_bank_settlements WHERE store_id=$1",[process.env.CLOUD_STORE_ID]);
  assert.equal(Number(settled.rows[0].n),1);
  assert.equal((await cloud.summary()).bank_vnd,order.total_vnd);
  const reqStamp=String(Date.now()),reqSig=mac(process.env.CLOUD_SYNC_SECRET,reqStamp+'.GET:'+process.env.CLOUD_STORE_ID+':0');
  await assert.rejects(()=>sepay.signedSettlements('0',process.env.CLOUD_STORE_ID,reqStamp,'broken'),e=>e.status===401);
  const env=await sepay.signedSettlements('0',process.env.CLOUD_STORE_ID,reqStamp,reqSig);
  assert.equal(env.payload.settlements.length,1);
  assert.equal(env.signature,mac(process.env.CLOUD_SYNC_SECRET,env.timestamp+'.'+JSON.stringify(env.payload)));
  const command=env.payload.settlements[0];
  const {CloudSyncWorker}=require('../apps/store-hub/dist/sync.js');
  const worker=new CloudSyncWorker(local),previousFetch=globalThis.fetch;
  process.env.CLOUD_SYNC_URL='http://127.0.0.1:4500';
  let tamper=true;
  globalThis.fetch=async(url,options)=>{
   const u=new URL(String(url)),h=options?.headers||{};
   assert.equal(u.pathname,'/v1/sync/settlements');
   const response=await sepay.signedSettlements(u.searchParams.get('after'),h['x-bmc-store'],h['x-bmc-timestamp'],h['x-bmc-signature']);
   if(tamper)response.payload.settlements[0].amount_vnd=1;
   return new Response(JSON.stringify(response),{status:200,headers:{'content-type':'application/json'}});
  };
  try{
   await assert.rejects(()=>worker.pullBankSettlements(),/Invalid cloud bank inbox signature/);
   assert.equal(local.order(staff,order.order_id).payment_status,'UNPAID');
   tamper=false;
   await worker.pullBankSettlements();
   await worker.pullBankSettlements();
  }finally{globalThis.fetch=previousFetch}
  assert.equal(local.order(staff,order.order_id).payment_status,'PAID');
  assert.equal(local.receipts(cashier,order.order_id).length,2);
  assert.equal(local.summary().bank_vnd,order.total_vnd);
  // The Hub later mirrors its local BANK payment to Cloud. It must not count
  // the same SePay credit a second time in Owner revenue-by-tender.
  const reconciledRows=local.store.all("SELECT id,entity,payload_json FROM sync_outbox WHERE entity IN ('order','payment') ORDER BY seq")
   .filter(x=>{const p=JSON.parse(x.payload_json);
    return (x.entity==='order'&&p.id===order.order_id&&p.version===2)||
      (x.entity==='payment'&&p.order_id===order.order_id)});
  const confirmedEvents=reconciledRows.map(x=>({id:x.id,entity:x.entity,payload:JSON.parse(x.payload_json)}));
  const committedAt=String(Date.now());
  await cloud.ingest(confirmedEvents,committedAt,
   mac(process.env.CLOUD_SYNC_SECRET,committedAt+'.'+JSON.stringify({events:confirmedEvents})),process.env.CLOUD_STORE_ID);
  assert.equal((await cloud.summary()).bank_vnd,order.total_vnd,'cloud must not double-count one bank transfer');


  // SePay receives an authenticated transfer before the Hub intent has synced.
  const lateOrder=local.createOrder(staff,{catalog_version:catalog.version,requested_payment_method:'BANK',items:[{product_id:catalog.products[0].id,qty:1}]},'sepay-late-order-0002');
  const lateIntent=local.bankIntent(cashier,lateOrder.order_id,'sepay-late-intent-0002');
  const late={...rawBase,id:92707,code:lateIntent.reference,content:lateIntent.reference+' late sync',transferAmount:lateOrder.total_vnd};
  const lateBody=JSON.stringify(late);
  assert.deepEqual(await sepay.receiveWebhook(Buffer.from(lateBody),sec,sign(lateBody)),{success:true});
  assert.equal((await cloud.summary()).bank_vnd,order.total_vnd);
  assert.ok((await cloud.bankExceptions()).some(x=>x.provider_tx_id==='sepay:92707'&&x.reason==='UNMATCHED_REFERENCE'));
  const lateRows=local.store.all("SELECT id,entity,payload_json FROM sync_outbox WHERE entity IN ('order','bank_intent') ORDER BY seq")
   .filter(x=>{const p=JSON.parse(x.payload_json);return p.id===lateOrder.order_id||p.order_id===lateOrder.order_id});
  const lateEvents=lateRows.map(x=>({id:x.id,entity:x.entity,payload:JSON.parse(x.payload_json)}));
  const lateStamp=String(Date.now());
  await cloud.ingest(lateEvents,lateStamp,mac(process.env.CLOUD_SYNC_SECRET,lateStamp+'.'+JSON.stringify({events:lateEvents})),process.env.CLOUD_STORE_ID);
  assert.equal((await cloud.summary()).bank_vnd,order.total_vnd+lateOrder.total_vnd);
  assert.ok(!(await cloud.bankExceptions()).some(x=>x.provider_tx_id==='sepay:92707'));
  const nextCursor=String(command.seq),tsNext=String(Date.now());
  const envelope=await sepay.signedSettlements(nextCursor,process.env.CLOUD_STORE_ID,tsNext,
   mac(process.env.CLOUD_SYNC_SECRET,tsNext+'.GET:'+process.env.CLOUD_STORE_ID+':'+nextCursor));
  assert.equal(envelope.payload.settlements.length,1);
  const next=envelope.payload.settlements[0];
  const nextEvent=JSON.stringify({provider_tx_id:next.provider_tx_id,reference:next.reference,account_number:next.account_number,
   bank_code:next.bank_code,amount_vnd:next.amount_vnd,direction:'CREDIT'});
  const nextTs=String(Date.now());
  assert.equal(local.bankEvent(nextEvent,nextTs,mac(process.env.BANK_BRIDGE_SECRET,nextTs+'.'+nextEvent)).state,'CONFIRMED');
  assert.equal(local.order(staff,lateOrder.order_id).payment_status,'PAID');
  assert.equal(local.receipts(cashier,lateOrder.order_id).length,2);
  const exceptions=await db.pool.query("SELECT reason FROM sepay_events WHERE store_id=$1 AND state='EXCEPTION'",[process.env.CLOUD_STORE_ID]);
  assert.deepEqual(exceptions.rows.map(x=>x.reason).sort(),['AMOUNT_MISMATCH','WRONG_RECEIVER'].sort());

  // WAN race: SePay verifies BANK while cashier, disconnected, has collected CASH.
  // Both transfers are real money but they represent ONE completed sale.
  const revenueBefore=await cloud.summary();
  const conflictOrder=local.createOrder(staff,{
   catalog_version:catalog.version,requested_payment_method:'BANK',
   items:[{product_id:catalog.products[0].id,qty:1}]
  },'cash-bank-conflict-order-0003');
  const conflictIntent=local.bankIntent(cashier,conflictOrder.order_id,'cash-bank-conflict-intent-0003');
  const candidates=local.store.all("SELECT id,entity,payload_json FROM sync_outbox WHERE entity IN ('order','bank_intent') ORDER BY seq")
   .filter(x=>{
    const payload=JSON.parse(x.payload_json);
    return payload.id===conflictOrder.order_id||payload.order_id===conflictOrder.order_id;
   });
  const initialEvents=candidates.map(x=>({id:x.id,entity:x.entity,payload:JSON.parse(x.payload_json)}));
  const initialStamp=String(Date.now());
  await cloud.ingest(initialEvents,initialStamp,
   mac(process.env.CLOUD_SYNC_SECRET,initialStamp+'.'+JSON.stringify({events:initialEvents})),process.env.CLOUD_STORE_ID);
  const bankCredit={...rawBase,id:92708,code:conflictIntent.reference,
   content:conflictIntent.reference+' while WAN down',transferAmount:conflictOrder.total_vnd};
  const creditJson=JSON.stringify(bankCredit);
  assert.deepEqual(await sepay.receiveWebhook(Buffer.from(creditJson),sec,sign(creditJson)),{success:true});
  assert.equal((await cloud.summary()).bank_vnd,revenueBefore.bank_vnd+conflictOrder.total_vnd);

  // Cloud is offline from the Hub perspective; cashier captures cash using local authority.
  const conflictShift=local.openShift(cashier,{opening_float_vnd:100000},'cash-bank-conflict-open-0003');
  const cash=local.cash(cashier,conflictOrder.order_id,{
   shift_id:conflictShift.id,cash_tendered_vnd:100000,
   expected_order_version:conflictOrder.version
  },'cash-bank-conflict-capture-0003');
  assert.equal(cash.cash_net_vnd,conflictOrder.total_vnd);
  assert.equal(local.receipts(cashier,conflictOrder.order_id).length,2);
  const cashRecords=local.store.all("SELECT id,entity,payload_json FROM sync_outbox WHERE entity IN ('order','payment') ORDER BY seq")
   .filter(x=>{
    const payload=JSON.parse(x.payload_json);
    return (x.entity==='order'&&payload.id===conflictOrder.order_id&&payload.version===2)
      ||(x.entity==='payment'&&payload.order_id===conflictOrder.order_id);
   }).map(x=>({id:x.id,entity:x.entity,payload:JSON.parse(x.payload_json)}));
  const cashStamp=String(Date.now());
  await cloud.ingest(cashRecords,cashStamp,
   mac(process.env.CLOUD_SYNC_SECRET,cashStamp+'.'+JSON.stringify({events:cashRecords})),process.env.CLOUD_STORE_ID);
  const reconciled=await cloud.summary();
  assert.equal(reconciled.net_revenue_vnd,revenueBefore.net_revenue_vnd+conflictOrder.total_vnd);
  assert.equal(reconciled.cash_vnd,revenueBefore.cash_vnd+conflictOrder.total_vnd);
  assert.equal(reconciled.bank_vnd,revenueBefore.bank_vnd,'BANK captured on a CASH-paid order cannot be sale revenue twice');
  assert.equal(reconciled.unallocated_bank_vnd,conflictOrder.total_vnd);
  assert.equal(reconciled.bank_conflict_orders,1);
  assert.ok((await cloud.bankExceptions()).some(x=>x.provider_tx_id==='sepay:92708'
   &&x.reason==='CASH_AND_BANK_CAPTURE'&&Number(x.amount_vnd)===conflictOrder.total_vnd));
  // Replaying a cash sync and a SePay webhook cannot create additional revenue or conflicts.
  await cloud.ingest(cashRecords,cashStamp,
   mac(process.env.CLOUD_SYNC_SECRET,cashStamp+'.'+JSON.stringify({events:cashRecords})),process.env.CLOUD_STORE_ID);
  await sepay.receiveWebhook(Buffer.from(creditJson),sec,sign(creditJson));
  assert.equal((await cloud.summary()).unallocated_bank_vnd,conflictOrder.total_vnd);

  // The signed bank inbox must respect local CASH-paid status; no second settlement or printer batch.
  const conflictStamp=String(Date.now());
  const settlementInbox=await sepay.signedSettlements(String(next.seq),process.env.CLOUD_STORE_ID,conflictStamp,
   mac(process.env.CLOUD_SYNC_SECRET,conflictStamp+'.GET:'+process.env.CLOUD_STORE_ID+':'+String(next.seq)));
  assert.equal(settlementInbox.payload.settlements.length,1);
  const bankEntry=settlementInbox.payload.settlements[0];
  const bodyConflict=JSON.stringify({provider_tx_id:bankEntry.provider_tx_id,reference:bankEntry.reference,
   account_number:bankEntry.account_number,bank_code:bankEntry.bank_code,amount_vnd:bankEntry.amount_vnd,direction:'CREDIT'});
  const tsConflict=String(Date.now());
  assert.equal(local.bankEvent(bodyConflict,tsConflict,mac(process.env.BANK_BRIDGE_SECRET,tsConflict+'.'+bodyConflict)).reason,'ALREADY_SETTLED');
  assert.equal(local.order(staff,conflictOrder.order_id).payment_status,'PAID');
  assert.equal(local.store.row('SELECT COUNT(*) n FROM payments WHERE order_id=?',conflictOrder.order_id).n,1);
  assert.equal(local.receipts(cashier,conflictOrder.order_id).length,2);
 }finally{await db.onModuleDestroy();rmSync(dir,{recursive:true,force:true})}
});
