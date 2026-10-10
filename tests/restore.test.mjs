import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,existsSync,writeFileSync,readFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {spawnSync} from 'node:child_process';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const script=resolve('scripts/store-backup.mjs');

test('WAL snapshot restore-copy preserves exact money/order/outbox and never overwrites the live ledger',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bmc-restore-'));
 const prev={path:process.env.STORE_DB_PATH,seed:process.env.SEED_DEMO_CATALOG};
 try{
  const live=join(dir,'live.sqlite'),backup=join(dir,'backup.sqlite'),copy=join(dir,'isolated','restored.sqlite');
  process.env.STORE_DB_PATH=live;
  process.env.SEED_DEMO_CATALOG='1';
  process.env.BOOTSTRAP_OWNER_PIN='restore-owner-secure';
  process.env.BOOTSTRAP_CASHIER_PIN='restore-cashier-secure';
  process.env.BOOTSTRAP_STAFF_PIN='restore-staff-secure';
  const {StoreService}=require('../apps/store-hub/dist/service.js');
  const svc=new StoreService();svc.onModuleInit();
  const staff=svc.actor('Bearer '+svc.login('staff','restore-staff-secure').token,['STAFF']);
  const cashier=svc.actor('Bearer '+svc.login('cashier','restore-cashier-secure').token,['CASHIER']);
  const catalog=svc.catalog();
  const input={catalog_version:catalog.version,requested_payment_method:'CASH',items:[{product_id:catalog.products[0].id,qty:2,note:'Không hành'}]};
  const order=svc.createOrder(staff,input,'restore-order-idem-001');
  const shift=svc.openShift(cashier,{opening_float_vnd:100000},'restore-open-shift-001');
  svc.cash(cashier,order.order_id,{shift_id:shift.id,cash_tendered_vnd:100000,expected_order_version:order.version},'restore-capture-idem-001');
  assert.equal(svc.receipts(cashier,order.order_id).length,2);
  const run=(cmd,...args)=>spawnSync(process.execPath,[script,cmd,...args],{
   cwd:resolve('.'),env:{...process.env,STORE_DB_PATH:live},encoding:'utf8'
  });
  const result=run('backup',backup);
  assert.equal(result.status,0,result.stderr);
  assert.ok(existsSync(backup));
  assert.equal(run('verify',backup).status,0);
  const snapshotSize=readFileSync(backup).length;
  // A later order only exists in the live database, proving the snapshot is point-in-time.
  svc.createOrder(staff,input,'restore-future-order-002');
  const copied=run('restore-copy',backup,copy);
  assert.equal(copied.status,0,copied.stderr);
  assert.ok(existsSync(copy));
  assert.equal(readFileSync(copy).length,snapshotSize);
  assert.equal(run('verify',copy).status,0);
  const originalLive=readFileSync(live).length;
  const replay=run('restore-copy',backup,copy);
  assert.notEqual(replay.status,0,'existing target must never be overwritten');
  assert.equal(readFileSync(live).length,originalLive);
  assert.notEqual(run('restore-copy',backup,live).status,0,'restore cannot replace the live path');
  const fake=join(dir,'invalid.sqlite');
  writeFileSync(fake,'not a sqlite database');
  assert.notEqual(run('restore-copy',fake,join(dir,'invalid-restored.sqlite')).status,0);
  assert.equal(existsSync(join(dir,'invalid-restored.sqlite')),false);

  // Reopen the copy as a Store Hub instance; idempotency, receipt batch and cash survive.
  process.env.STORE_DB_PATH=copy;
  const restored=new StoreService();restored.onModuleInit();
  const s2=restored.actor('Bearer '+restored.login('staff','restore-staff-secure').token,['STAFF']);
  const c2=restored.actor('Bearer '+restored.login('cashier','restore-cashier-secure').token,['CASHIER']);
  assert.equal(restored.store.row('SELECT COUNT(*) n FROM orders').n,1);
  assert.equal(restored.store.row('SELECT COUNT(*) n FROM payments').n,1);
  assert.equal(restored.store.row('SELECT COUNT(*) n FROM receipts').n,2);
  assert.ok(restored.store.row('SELECT COUNT(*) n FROM sync_outbox').n>0);
  assert.equal(restored.store.row('SELECT COUNT(*) n FROM idempotency').n>0);
  assert.equal(restored.createOrder(s2,input,'restore-order-idem-001').order_id,order.order_id);
  assert.equal(restored.receipts(c2,order.order_id).length,2);
  assert.equal(restored.summary().cash_vnd,order.total_vnd);
  assert.equal(restored.getShift(shift.id).expected_cash_vnd,100000+order.total_vnd);
 }finally{
  if(prev.path===undefined)delete process.env.STORE_DB_PATH;else process.env.STORE_DB_PATH=prev.path;
  if(prev.seed===undefined)delete process.env.SEED_DEMO_CATALOG;else process.env.SEED_DEMO_CATALOG=prev.seed;
  rmSync(dir,{recursive:true,force:true});
 }
});
