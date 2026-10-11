import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createHmac} from 'node:crypto';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

test('Cloud price and cash-shift mirror never regresses when signed outbox events arrive out of order',async()=>{
 const keys=['CLOUD_STORE_ID','CLOUD_SYNC_SECRET'];
 const old=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 process.env.CLOUD_STORE_ID='ci-monotonic-projection-store';
 process.env.CLOUD_SYNC_SECRET='ci-monotonic-hmac-secret-more-than-32-chars';
 const {CloudDb}=require('../apps/cloud-api/dist/db.js');
 const {CloudService}=require('../apps/cloud-api/dist/service.js');
 const {SePayService}=require('../apps/cloud-api/dist/sepay.js');
 const db=new CloudDb();
 try{
  await db.onModuleInit();
  const store=process.env.CLOUD_STORE_ID,secret=process.env.CLOUD_SYNC_SECRET,stamp=String(Date.now());
  await db.pool.query('DELETE FROM synced_events WHERE store_id=$1',[store]);
  await db.pool.query('DELETE FROM mirror_products WHERE store_id=$1',[store]);
  await db.pool.query('DELETE FROM mirror_shifts WHERE store_id=$1',[store]);
  const svc=new CloudService(db,new SePayService(db));
  const sign=events=>createHmac('sha256',secret).update(stamp+'.'+JSON.stringify({events})).digest('hex');
  const send=events=>svc.ingest(events,stamp,sign(events),store);
  const p={id:'bm-order-projection',name:'Bánh mì cũ',category:'Bánh mì',price_vnd:35000,is_active:true};
  const product=(id,seq,payload)=>({...seq===undefined?{}:{seq},id,entity:'product',payload});
  const getProduct=async()=>{
   const r=await db.pool.query('SELECT name,price_vnd,is_active,source_seq FROM mirror_products WHERE store_id=$1 AND id=$2',[store,p.id]);
   return r.rows[0];
  };
  // Prior Hub version without seq remains accepted, until a sequenced update arrives.
  await send([product('legacy-p',undefined,p)]);
  assert.equal(Number((await getProduct()).source_seq),0);
  const updated={...p,name:'Bánh mì giá mới',price_vnd:48000,is_active:false};
  await send([product('price-new-112',112,updated)]);
  assert.equal(Number((await getProduct()).price_vnd),48000);
  assert.equal((await getProduct()).is_active,false);
  // Delayed older event, legacy packet and duplicate sequence with different event ID
  // must be ACKed/deduplicated but cannot overwrite the newer price/active state.
  await send([product('price-old-106',106,p)]);
  await send([product('price-old-legacy',undefined,p)]);
  await send([product('price-same-112',112,p)]);
  const latest=await getProduct();
  assert.equal(latest.name,'Bánh mì giá mới');
  assert.equal(Number(latest.price_vnd),48000);
  assert.equal(latest.is_active,false);
  assert.equal(Number(latest.source_seq),112);
  assert.equal(Number((await db.pool.query('SELECT count(*) n FROM synced_events WHERE store_id=$1',[store])).rows[0].n),5);
  // Still advance when a truly newer Hub event is received.
  await send([product('price-new-113',113,{...updated,price_vnd:49000})]);
  assert.equal(Number((await getProduct()).price_vnd),49000);
  assert.equal(Number((await getProduct()).source_seq),113);

  const opened='2026-10-10T04:00:00.000Z';
  const shift={id:'shift-monotonic',cashier_id:'cashier',opening_float_vnd:300000,
   status:'OPEN',opened_at:opened,closed_at:null,counted_cash_vnd:null,variance_vnd:null};
  const closed={...shift,status:'CLOSED',closed_at:'2026-10-10T14:00:00.000Z',counted_cash_vnd:350000,variance_vnd:0};
  const shiftEvent=(id,seq,payload)=>({id,seq,entity:'shift',payload});
  await send([shiftEvent('closed-first-220',220,closed)]);
  await send([shiftEvent('open-late-211',211,shift)]);
  const row=(await db.pool.query('SELECT status,closed_at,counted_cash_vnd,source_seq FROM mirror_shifts WHERE store_id=$1 AND id=$2',[store,shift.id])).rows[0];
  assert.equal(row.status,'CLOSED');
  assert.equal(Number(row.counted_cash_vnd),350000);
  assert.equal(Number(row.source_seq),220);
  assert.ok(row.closed_at);
  assert.equal((await svc.summary()).shift,null,'a delayed OPEN event cannot reopen the Owner cloud drawer');

  for(const invalid of [0,-2,1.5,Number.MAX_SAFE_INTEGER+1,'999']){
   const bad=[product('invalid-'+String(invalid),invalid,updated)];
   await assert.rejects(()=>send(bad),e=>e.status===400,'reject invalid sequence '+invalid);
  }
  // Entire PG batch must roll back when any event has a bad sequence;
  // even an earlier valid update in the same batch must not partially apply.
  const mixed=[product('not-committed-114',114,{...updated,price_vnd:50000}),
   shiftEvent('bad-shift-batch',0,closed)];
  await assert.rejects(()=>send(mixed),e=>e.status===400);
  assert.equal(Number((await getProduct()).price_vnd),49000);
  const failed=await db.pool.query("SELECT 1 FROM synced_events WHERE store_id=$1 AND event_id='not-committed-114'",[store]);
  assert.equal(failed.rowCount,0);

  // Signed sender may retry old batches after timeout; ACK does not imply rollback.
  assert.deepEqual((await send([product('price-old-106',106,p)])).received,['price-old-106']);
  assert.equal(Number((await getProduct()).price_vnd),49000);
 }finally{
  await db.onModuleDestroy();
  for(const [k,v] of Object.entries(old))if(v===undefined)delete process.env[k];else process.env[k]=v;
 }
});
