import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
const require=createRequire(import.meta.url);

async function virtualPrinter(){
 const packets=[];
 const server=createServer(socket=>{
  const chunks=[];
  socket.on('data',data=>chunks.push(data));
  socket.on('end',()=>{packets.push(Buffer.concat(chunks));socket.end()});
 });
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 const port=server.address().port;
 return {port,packets,close:()=>new Promise((resolve,reject)=>server.close(e=>e?reject(e):resolve()))};
}
test('80mm ESC/POS jobs: exactly two original copies, audited sends, UNKNOWN on offline and explicit watermarked reprint',async()=>{
 const folder=mkdtempSync(join(tmpdir(),'bmc-printer-'));
 const env={path:process.env.STORE_DB_PATH,printer:process.env.PRINTER_HOST,port:process.env.PRINTER_PORT,seed:process.env.SEED_DEMO_CATALOG};
 let emulator=null;
 try{
  process.env.STORE_DB_PATH=join(folder,'printer.sqlite');
  process.env.BOOTSTRAP_OWNER_PIN='test-printer-owner';
  process.env.BOOTSTRAP_CASHIER_PIN='test-printer-cashier';
  process.env.BOOTSTRAP_STAFF_PIN='test-printer-staff';
  process.env.SEED_DEMO_CATALOG='1';
  const {StoreService}=require('../apps/store-hub/dist/service.js');
  const {ReceiptPrinter}=require('../apps/store-hub/dist/printer.js');
  const store=new StoreService();store.onModuleInit();
  const staff=store.actor('Bearer '+store.login('staff','test-printer-staff').token,['STAFF']);
  const cashier=store.actor('Bearer '+store.login('cashier','test-printer-cashier').token,['CASHIER']);
  const catalog=store.catalog();
  const shift=store.openShift(cashier,{opening_float_vnd:500000},'printer-open-shift-01');
  const order=store.createOrder(staff,{
   catalog_version:catalog.version,requested_payment_method:'CASH',
   items:[{product_id:catalog.products[0].id,qty:2,note:'Không hành'}]
  },'printer-order-a-001');
  store.cash(cashier,order.order_id,{shift_id:shift.id,cash_tendered_vnd:100000,
   expected_order_version:order.version},'printer-payment-a-001');
  const originals=store.receipts(cashier,order.order_id);
  assert.equal(originals.length,2);
  assert.deepEqual(originals.map(x=>x.kind).sort(),['CUSTOMER','STORE']);
  assert.throws(()=>store.reprint(cashier,originals[0].id,{reason:'Đang in'},'printer-too-soon-001'),
   e=>e.code==='RECEIPT_ALREADY_QUEUED');

  emulator=await virtualPrinter();
  process.env.PRINTER_HOST='127.0.0.1';process.env.PRINTER_PORT=String(emulator.port);
  const driver=new ReceiptPrinter(store);
  await driver.dispatch();await driver.dispatch();await driver.dispatch();
  assert.equal(emulator.packets.length,2,'must not send a third initial copy');
  assert.ok(emulator.packets.every(b=>b.length>1000&&b[0]===0x1b&&b[1]===0x40),'valid raster ESC/POS prefix');
  assert.ok(emulator.packets.every(b=>b.subarray(2,6).equals(Buffer.from([0x1d,0x76,0x30,0x00]))));
  assert.notDeepEqual(emulator.packets[0],emulator.packets[1],'customer/store copies must be distinct');
  assert.ok(store.receipts(cashier,order.order_id).every(x=>x.status==='SENT'&&x.attempts===1));
  assert.equal(store.store.row('SELECT COUNT(*) n FROM receipt_print_attempts').n,2);
  assert.equal(store.store.row("SELECT COUNT(*) n FROM receipt_print_attempts WHERE status='SENT'").n,2);

  // Print again requires reason and explicit cashier action; it never re-captures funds.
  const reprint=store.reprint(cashier,originals[0].id,{reason:'Khách mất liên'},'printer-reprint-a-001');
  assert.equal(reprint.status,'WAITING_FOR_PRINTER');
  await driver.dispatch();
  assert.equal(emulator.packets.length,3);
  assert.ok(!emulator.packets[2].equals(emulator.packets[0]),'reprint raster includes a visible watermark');
  assert.equal(store.store.row('SELECT COUNT(*) n FROM payments WHERE order_id=?',order.order_id).n,1);
  assert.equal(store.receipts(cashier,order.order_id).length,2,'no extra intent batches from reprinting');
  assert.equal(store.store.row('SELECT COUNT(*) n FROM receipt_print_attempts').n,3);

  // Simulate printer offline before the first copy of a second paid order.
  const second=store.createOrder(staff,{
   catalog_version:catalog.version,requested_payment_method:'CASH',
   items:[{product_id:catalog.products[1].id,qty:1}]
  },'printer-order-b-001');
  store.cash(cashier,second.order_id,{shift_id:shift.id,cash_tendered_vnd:100000,
   expected_order_version:second.version},'printer-payment-b-001');
  await emulator.close();
  emulator=null;
  const before=store.store.row("SELECT id FROM receipts WHERE status='WAITING_FOR_PRINTER' ORDER BY created_at,id LIMIT 1").id;
  await driver.dispatch(); // ECONNREFUSED: printer may have consumed bytes, so always UNKNOWN
  assert.equal(store.store.row('SELECT status FROM receipts WHERE id=?',before).status,'UNKNOWN');
  assert.equal(store.store.row("SELECT status FROM receipt_print_attempts WHERE receipt_id=? ORDER BY started_at DESC LIMIT 1",before).status,'UNKNOWN');
  // Manually restoring printer still must not automatically resubmit UNKNOWN receipts.
  emulator=await virtualPrinter();process.env.PRINTER_PORT=String(emulator.port);
  await driver.dispatch();await driver.dispatch();
  assert.equal(store.store.row('SELECT status FROM receipts WHERE id=?',before).status,'UNKNOWN');
  assert.equal(emulator.packets.length,1,'only the other original copy may be auto-sent');
  const reclaimed=store.reprint(cashier,before,{reason:'Đã kiểm tra giấy không ra'},'printer-reprint-b-001');
  assert.equal(reclaimed.status,'WAITING_FOR_PRINTER');
  await driver.dispatch();
  assert.equal(emulator.packets.length,2,'explicit operator reprint allows one additional send');
  assert.equal(store.store.row('SELECT status FROM receipts WHERE id=?',before).status,'SENT');
  assert.equal(store.store.row('SELECT COUNT(*) n FROM receipt_print_attempts WHERE receipt_id=?',before).n,2);
  assert.equal(store.store.row('SELECT COUNT(*) n FROM payments WHERE order_id=?',second.order_id).n,1);
 }finally{
  if(emulator)await emulator.close();
  for(const [k,v] of Object.entries({STORE_DB_PATH:env.path,PRINTER_HOST:env.printer,PRINTER_PORT:env.port,SEED_DEMO_CATALOG:env.seed})){
   if(v===undefined)delete process.env[k];else process.env[k]=v;
  }
  rmSync(folder,{recursive:true,force:true});
 }
});
