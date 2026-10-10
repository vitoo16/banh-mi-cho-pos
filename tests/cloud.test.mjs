import {test} from 'node:test';import assert from 'node:assert/strict';
import {randomUUID} from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('PostgreSQL reconciliation: early callback, exact match, replay and wrong amount',async()=>{
 process.env.BANK_ACCOUNT_NUMBER='123456789';process.env.BANK_BIN='970415';process.env.CLOUD_SYNC_TOKEN='test-cloud-token-is-at-least-32-characters-long';
 const {CloudDb}=require('../apps/cloud-api/dist/db.js');
 const {CloudService}=require('../apps/cloud-api/dist/service.js');
 const db=new CloudDb();
 await db.onModuleInit();
 try{
  const s=new CloudService(db),orderId=randomUUID(),ref='BMC0123456789ABCDEF';
  const incoming=(id,amount,content=ref)=>({id,gateway:'Vietcombank',accountNumber:'123456789',transferType:'in',transferAmount:amount,content,code:null,referenceCode:'BANK_REF_'+id});
  // Callback can precede order and should not settle until order/intent arrive.
  await s.webhook(incoming(100001,35000));
  assert.equal((await s.settlements('0')).items.length,0);
  const event1={id:randomUUID(),kind:'ORDER',payload:{order_id:orderId,display_code:'B00200',total_vnd:35000,status:'COMMITTED',created_at:new Date().toISOString()}};
  const event2={id:randomUUID(),kind:'BANK_INTENT',payload:{order_id:orderId,reference:ref,account_number:'123456789',bank_bin:'970415',amount_vnd:35000}};
  await s.ingest([event2,event1]); // Intent arrived before order in batch; cloud orders deterministically.
  const first=await s.settlements('0');assert.equal(first.items.length,1);assert.equal(first.items[0].amount_vnd,35000);
  await s.webhook(incoming(100001,35000)); // duplicate provider transaction id
  assert.equal((await s.settlements('0')).items.length,1);
  await s.webhook(incoming(100002,40000)); // correct memo, wrong amount
  assert.equal((await s.settlements('0')).items.length,1);
  const ex=await s.exceptions();assert.ok(ex.some(x=>String(x.provider_tx_id)==='100002'));
  const next=await s.settlements(String(first.next_seq));assert.deepEqual(next.items,[]);
  const cashOrder=randomUUID(),cashEvent={id:randomUUID(),kind:'ORDER',payload:{order_id:cashOrder,display_code:'B00201',total_vnd:42000,status:'COMMITTED',created_at:new Date().toISOString()}};
  await s.ingest([cashOrder&&cashEvent,{id:randomUUID(),kind:'CASH_CAPTURE',payload:{order_id:cashOrder,payment_id:randomUUID(),amount_vnd:42000}}]);
  await s.ingest([{id:randomUUID(),kind:'CASH_REFUND',payload:{order_id:cashOrder,refund_id:randomUUID(),amount_vnd:42000}}]);
  const row=await db.pool.query('SELECT status FROM cloud_orders WHERE order_id=$1',[cashOrder]);assert.equal(row.rows[0].status,'REFUNDED_CASH');
  const canceledId=randomUUID(),canceledRef='BMCFFFFFFFFFFFFFFFF';
  await s.ingest([{id:randomUUID(),kind:'ORDER',payload:{order_id:canceledId,display_code:'B00999',total_vnd:25000,status:'COMMITTED',created_at:new Date().toISOString()}},{id:randomUUID(),kind:'BANK_INTENT',payload:{order_id:canceledId,reference:canceledRef,amount_vnd:25000,account_number:'123456789',bank_bin:'970415'}}]);
  await s.ingest([{id:randomUUID(),kind:'CASH_CAPTURE',payload:{order_id:canceledId,payment_id:randomUUID(),amount_vnd:25000}}]);
  await s.webhook(incoming(100003,25000,canceledRef));
  const forbidden=await s.exceptions();assert.ok(forbidden.some(x=>String(x.provider_tx_id)==='100003'));
  assert.equal((await s.settlements('0')).items.length,1);

 }finally{await db.onModuleDestroy()}
});
