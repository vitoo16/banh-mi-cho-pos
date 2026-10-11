import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';import {tmpdir} from 'node:os';
import {salesWindow} from '../packages/contracts/dist/index.js';
const require=createRequire(import.meta.url);

test('Owner local analytics have no arbitrary 300-order cap and never count unpaid/refunded/voided as sold',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bmc-analytics-hub-'));
 const saved={};
 for(const key of ['STORE_DB_PATH','SEED_DEMO_CATALOG','BOOTSTRAP_OWNER_PIN','BOOTSTRAP_CASHIER_PIN','BOOTSTRAP_STAFF_PIN'])saved[key]=process.env[key];
 try{
  process.env.STORE_DB_PATH=join(dir,'shop.sqlite');
  process.env.SEED_DEMO_CATALOG='1';
  process.env.BOOTSTRAP_OWNER_PIN='analytics-owner-pin';
  process.env.BOOTSTRAP_CASHIER_PIN='analytics-cashier-pin';
  process.env.BOOTSTRAP_STAFF_PIN='analytics-staff-pin';
  const {StoreService}=require('../apps/store-hub/dist/service.js'),s=new StoreService();s.onModuleInit();
  const today=new Date().toISOString();
  const yesterday=new Date(Date.parse(salesWindow('day').start_utc)-1000).toISOString();
  const body={product_id:'bm-thit',name_snapshot:'Bánh mì thịt',qty:2,unit_price_vnd:35000,line_total_vnd:70000,note:''};
  const add=(n,status,payment,when=today,product=body)=>{
   s.store.run(`INSERT INTO orders(id,display_code,created_at,created_by,requested_method,total_vnd,lines_json,status,payment_status)
    VALUES(?,?,?,?,?,?,?,?,?)`,
    'test-analytics-order-'+n,'QA'+String(n).padStart(6,'0'),when,'staff','CASH',product.line_total_vnd,
    JSON.stringify([product]),status,payment);
  };
  // 402 fully paid, 1 unpaid, 1 voided, 1 fully refunded => total 405 today.
  for(let i=0;i<402;i++)add(i,'COMMITTED','PAID');
  add(402,'COMMITTED','UNPAID');
  add(403,'VOIDED','UNPAID');
  add(404,'COMMITTED','REFUNDED');
  add(405,'COMMITTED','PAID',yesterday);
  const totals=s.todayOrderCounts();
  assert.deepEqual(totals,{total_orders:405,voided_orders:1,paid_orders:402,refunded_orders:1,pending_orders:1});
  const report=s.productSales('day');
  assert.equal(report.total_orders,405);
  assert.equal(report.total_units_sold,804);
  assert.equal(report.gross_vnd,402*70000);
  assert.equal(report.products.length,1);
  assert.equal(report.products[0].units_sold,804);
  assert.equal(report.categories[0].category,'Bánh mì');
  assert.equal(report.sales_definition,'PAID_ONLY_BY_ORDER_CREATED_AT');
  assert.equal(report.total_orders-report.paid_orders,3);
  assert.equal(s.productSales('year').total_units_sold>=804,true);
  assert.throws(()=>s.productSales('bad'),/INVALID_PERIOD/);
 }finally{
  for(const [k,v] of Object.entries(saved))if(v===undefined)delete process.env[k];else process.env[k]=v;
  rmSync(dir,{recursive:true,force:true});
 }
});
