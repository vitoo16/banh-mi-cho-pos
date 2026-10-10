import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createHmac} from 'node:crypto';
const require=createRequire(import.meta.url);
test('signed cloud replication, deduplication, payment projection and remote Owner auth',async()=>{
 process.env.CLOUD_STORE_ID='ci-test-store';
 process.env.CLOUD_SYNC_SECRET='ci-test-cloud-secret-32-plus-characters';
 process.env.CLOUD_OWNER_LOGIN_SECRET='ci-owner-password-long-enough';
 const {CloudDb}=require('../apps/cloud-api/dist/db.js');
 const {CloudService}=require('../apps/cloud-api/dist/service.js');
 const db=new CloudDb();await db.onModuleInit();
 try{
  await db.pool.query('TRUNCATE synced_events,mirror_orders,mirror_payments,mirror_refunds,mirror_products,mirror_shifts,mirror_cash_movements');
  const svc=new CloudService(db);
  const stamp=String(Date.now()),store='ci-test-store';
  const sign=es=>createHmac('sha256',process.env.CLOUD_SYNC_SECRET).update(stamp+'.'+JSON.stringify({events:es})).digest('hex');
  const order={id:'test-order-1',display_code:'B00001',created_at:new Date().toISOString(),created_by:'staff',status:'COMMITTED',payment_status:'UNPAID',requested_method:'CASH',total_vnd:35000,version:1,lines_json:'[]'};
  const events=[{id:'ev1',entity:'order',payload:order}];
  await assert.rejects(()=>svc.ingest(events,stamp,'invalid',store));
  assert.deepEqual((await svc.ingest(events,stamp,sign(events),store)).received,['ev1']);
  assert.deepEqual((await svc.ingest(events,stamp,sign(events),store)).received,['ev1']);
  assert.equal((await svc.summary()).pending_orders,1);
  const paid=[{id:'ev2',entity:'order',payload:{...order,version:2,payment_status:'PAID'}},{id:'ev3',entity:'payment',payload:{id:'pay-1',order_id:order.id,method:'CASH',amount_vnd:35000,created_at:order.created_at}}];
  await svc.ingest(paid,stamp,sign(paid),store);
  const summary=await svc.summary();assert.equal(summary.paid_orders,1);assert.equal(summary.net_revenue_vnd,35000);assert.equal(summary.cash_vnd,35000);
  const move=[{id:'ev4',entity:'shift',payload:{id:'shift1',cashier_id:'cashier',opening_float_vnd:1000000,status:'OPEN',opened_at:order.created_at,closed_at:null}},{id:'ev5',entity:'cash_movement',payload:{id:'mv1',shift_id:'shift1',order_id:order.id,kind:'CASH_RECEIVED',amount_vnd:100000,created_at:order.created_at}},{id:'ev6',entity:'cash_movement',payload:{id:'mv2',shift_id:'shift1',order_id:order.id,kind:'CHANGE_PAID',amount_vnd:-65000,created_at:order.created_at}}];
  await svc.ingest(move,stamp,sign(move),store);
  assert.equal((await svc.summary()).shift.expected_cash_vnd,1035000);
  assert.throws(()=>svc.login('owner','wrong'));
  const login=svc.login('owner',process.env.CLOUD_OWNER_LOGIN_SECRET);
  svc.authorize('Bearer '+login.token);
  assert.equal((await svc.orderHistory()).items.length,1);
 }finally{await db.onModuleDestroy()}
});
