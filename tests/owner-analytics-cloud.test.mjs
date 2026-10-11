import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {salesWindow} from '../packages/contracts/dist/index.js';
const require=createRequire(import.meta.url);

test('Cloud Owner reporting groups 450+ daily paid orders via PostgreSQL without history-page cap',async()=>{
 const envKeys=['CLOUD_STORE_ID','CLOUD_SYNC_SECRET'];
 const old=Object.fromEntries(envKeys.map(k=>[k,process.env[k]]));
 process.env.CLOUD_STORE_ID='ci-analytics-store';
 process.env.CLOUD_SYNC_SECRET='ci-analytics-secret-over-32-chars';
 const {CloudDb}=require('../apps/cloud-api/dist/db.js');
 const {CloudService}=require('../apps/cloud-api/dist/service.js');
 const {SePayService}=require('../apps/cloud-api/dist/sepay.js');
 const db=new CloudDb();
 try{
  await db.onModuleInit();
  const store=process.env.CLOUD_STORE_ID;
  await db.pool.query('DELETE FROM mirror_orders WHERE store_id=$1',[store]);
  await db.pool.query('DELETE FROM mirror_products WHERE store_id=$1',[store]);
  await db.pool.query(`INSERT INTO mirror_products(store_id,id,name,category,price_vnd,is_active)
   VALUES($1,'bm-thit','Bánh mì thịt','Bánh mì',35000,true),
   ($1,'banh-bao','Bánh bao','Bánh bao',20000,true)`,[store]);
  const win=salesWindow('day'),at=new Date(Date.parse(win.start_utc)+3600000);
  const line=[{product_id:'bm-thit',name_snapshot:'Bánh mì thịt',qty:2,line_total_vnd:70000},
   {product_id:'banh-bao',name_snapshot:'Bánh bao',qty:1,line_total_vnd:20000}];
  // Cloud mirror fixtures are source-like order snapshots; no money action API invoked.
  await db.pool.query(`INSERT INTO mirror_orders
   (store_id,id,display_code,created_at,created_by,status,payment_status,requested_method,total_vnd,version,lines_json)
   SELECT $1,'sale-'+g::text,'Q'||g::text,$2::timestamptz,'staff',
   CASE WHEN g=453 THEN 'VOIDED' ELSE 'COMMITTED' END,
   CASE WHEN g<=450 THEN 'PAID' WHEN g=454 THEN 'REFUNDED' ELSE 'UNPAID' END,
   'CASH',90000,1,$3::jsonb
   FROM generate_series(1,454) g`,[store,at.toISOString(),JSON.stringify(line)]);
  const svc=new CloudService(db,new SePayService(db));
  assert.deepEqual(await svc.todayOrderCounts(),
   {total_orders:454,voided_orders:1,paid_orders:450,refunded_orders:1,pending_orders:2});
  const r=await svc.productSales('day');
  assert.equal(r.total_orders,454);
  assert.equal(r.paid_orders,450);
  assert.equal(r.total_units_sold,1350);
  assert.equal(r.gross_vnd,450*90000);
  assert.deepEqual(r.categories.map(x=>[x.category,x.units_sold]).sort(),
   [['Bánh bao',450],['Bánh mì',900]].sort());
  assert.equal(r.products.length,2);
  assert.equal(r.sales_definition,'PAID_ONLY_BY_ORDER_CREATED_AT');
  assert.deepEqual((await svc.productSales('year')).products.map(x=>x.units_sold).sort((a,b)=>a-b),[450,900]);
  await assert.rejects(()=>svc.productSales('week','2026-02-29'),/INVALID_DATE/);
 }finally{
  await db.onModuleDestroy();
  for(const [key,value] of Object.entries(old))if(value===undefined)delete process.env[key];else process.env[key]=value;
 }
});
