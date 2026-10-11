import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

test('same idempotency key requires same immutable order and cash-capture payload',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bmc-idem-'));
 const vars=['STORE_DB_PATH','SEED_DEMO_CATALOG','PAIRING_ENFORCED','BOOTSTRAP_OWNER_PIN','BOOTSTRAP_CASHIER_PIN','BOOTSTRAP_STAFF_PIN'];
 const previous=Object.fromEntries(vars.map(k=>[k,process.env[k]]));
 try{
  process.env.STORE_DB_PATH=join(dir,'shop.sqlite');
  process.env.SEED_DEMO_CATALOG='1';
  delete process.env.PAIRING_ENFORCED;
  process.env.BOOTSTRAP_OWNER_PIN='owner-idempotency-pin';
  process.env.BOOTSTRAP_CASHIER_PIN='cashier-idempotency-pin';
  process.env.BOOTSTRAP_STAFF_PIN='staff-idempotency-pin';
  const {StoreService}=require('../apps/store-hub/dist/service.js');
  const s=new StoreService();s.onModuleInit();
  const staff=s.actor('Bearer '+s.login('staff',process.env.BOOTSTRAP_STAFF_PIN).token,['STAFF']);
  const cashier=s.actor('Bearer '+s.login('cashier',process.env.BOOTSTRAP_CASHIER_PIN).token,['CASHIER']);
  const catalog=s.catalog(),product=catalog.products[0],key='create-order-payload-test-0001';
  const body={catalog_version:catalog.version,requested_payment_method:'CASH',items:[{product_id:product.id,qty:1}]};
  const o=s.createOrder(staff,body,key);
  // Reordering JSON object keys does not change a genuine retry.
  assert.deepEqual(s.createOrder(staff,{items:[{qty:1,product_id:product.id}],requested_payment_method:'CASH',catalog_version:catalog.version},key),o);
  assert.throws(()=>s.createOrder(staff,{...body,items:[{product_id:product.id,qty:2}]},key),e=>e.code==='IDEMPOTENCY_PAYLOAD_MISMATCH');
  assert.equal(s.store.row('SELECT COUNT(*) n FROM orders').n,1);
  const shift=s.openShift(cashier,{opening_float_vnd:100000},'shift-idempotency-test-0001');
  const capture={shift_id:shift.id,cash_tendered_vnd:100000,expected_order_version:o.version};
  const paid=s.cash(cashier,o.order_id,capture,'cash-idempotency-test-0001');
  assert.deepEqual(s.cash(cashier,o.order_id,capture,'cash-idempotency-test-0001'),paid);
  assert.throws(()=>s.cash(cashier,o.order_id,{...capture,cash_tendered_vnd:200000},'cash-idempotency-test-0001'),e=>e.code==='IDEMPOTENCY_PAYLOAD_MISMATCH');
  assert.equal(s.store.row('SELECT COUNT(*) n FROM payments').n,1);
  assert.equal(s.store.row('SELECT COUNT(*) n FROM receipts').n,2);
  // Recover/retry across a simulated Hub service restart with an unchanged key.
  const rebooted=new StoreService();
  assert.deepEqual(rebooted.cash(cashier,o.order_id,capture,'cash-idempotency-test-0001'),paid);
  // Rows created before this migration lack the original request hash.
  s.store.run('INSERT INTO idempotency(scope,key,result_json) VALUES(?,?,?)','order.create:staff','legacy-order-key-0001','{}');
  assert.throws(()=>s.createOrder(staff,body,'legacy-order-key-0001'),e=>e.code==='IDEMPOTENCY_LEGACY_REVIEW');
 }finally{
  for(const [k,v] of Object.entries(previous))if(v===undefined)delete process.env[k];else process.env[k]=v;
  rmSync(dir,{recursive:true,force:true});
 }
});

test('legacy SQLite idempotency table receives additive request_hash migration',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bmc-legacy-idem-'));
 try{
  const path=join(dir,'legacy.sqlite');
  const {DatabaseSync}=require('node:sqlite');
  const sqlite=new DatabaseSync(path);
  sqlite.exec('CREATE TABLE idempotency(scope TEXT NOT NULL,key TEXT NOT NULL,result_json TEXT NOT NULL,PRIMARY KEY(scope,key))');
  sqlite.exec("INSERT INTO idempotency(scope,key,result_json) VALUES('test','key123456','{}')");
  sqlite.close();
  const {StoreDb}=require('../apps/store-hub/dist/db.js');
  const upgraded=new StoreDb(path);
  assert.ok(upgraded.all('PRAGMA table_info(idempotency)').some(c=>c.name==='request_hash'));
  assert.equal(upgraded.row("SELECT request_hash FROM idempotency WHERE scope='test'").request_hash,null);
  upgraded.db.close();
 }finally{rmSync(dir,{recursive:true,force:true})}
});
