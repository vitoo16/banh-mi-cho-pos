import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {createServer} from 'node:net';
import {mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';

const require=createRequire(import.meta.url);

async function mockEscPos(){
 const received=[];
 const server=createServer(socket=>{
  const chunks=[];
  socket.on('data',part=>chunks.push(part));
  socket.on('end',()=>{received.push(Buffer.concat(chunks));socket.end()});
 });
 await new Promise((resolve,reject)=>server.once('error',reject).listen(0,'127.0.0.1',resolve));
 return {
  port:server.address().port,
  received,
  close:()=>new Promise((resolve,reject)=>server.close(error=>error?reject(error):resolve())),
 };
}
test('Q-09: printer disconnect after first receipt leaves second UNKNOWN across Hub service restart, no auto-retry or second settlement', {
 timeout:45_000,
},async()=>{
 const dir=mkdtempSync(join(tmpdir(),'bmc-printer-second-copy-'));
 const envKeys=['STORE_DB_PATH','PRINTER_HOST','PRINTER_PORT','SEED_DEMO_CATALOG',
  'BOOTSTRAP_OWNER_PIN','BOOTSTRAP_CASHIER_PIN','BOOTSTRAP_STAFF_PIN'];
 const saved=Object.fromEntries(envKeys.map(key=>[key,process.env[key]]));
 let emulator,service;
 try{
  process.env.STORE_DB_PATH=join(dir,'printer.sqlite');
  process.env.SEED_DEMO_CATALOG='1';
  process.env.BOOTSTRAP_OWNER_PIN='printer-qa-owner';
  process.env.BOOTSTRAP_CASHIER_PIN='printer-qa-cashier';
  process.env.BOOTSTRAP_STAFF_PIN='printer-qa-staff';
  const {StoreService}=require('../apps/store-hub/dist/service.js');
  const {ReceiptPrinter,buildReceiptLines}=require('../apps/store-hub/dist/printer.js');
  service=new StoreService();service.onModuleInit();
  const cashier=service.actor('Bearer '+service.login('cashier',process.env.BOOTSTRAP_CASHIER_PIN).token,['CASHIER']);
  const staff=service.actor('Bearer '+service.login('staff',process.env.BOOTSTRAP_STAFF_PIN).token,['STAFF']);
  const shift=service.openShift(cashier,{opening_float_vnd:250_000},'q09-shift');
  const cat=service.catalog();
  const input={catalog_version:cat.version,requested_payment_method:'CASH',
   items:[{product_id:'bm-thit',qty:2,note:'Không hành'}]};
  const order=service.createOrder(staff,input,'q09-order-create');
  const captured=service.cash(cashier,order.order_id,{
   shift_id:shift.id,cash_tendered_vnd:100_000,expected_order_version:order.version,
  },'q09-once-capture');
  assert.equal(captured.cash_net_vnd,70_000);
  const initial=service.receipts(cashier,order.order_id);
  assert.equal(initial.length,2);
  assert.deepEqual(initial.map(r=>r.kind).sort(),['CUSTOMER','STORE']);
  emulator=await mockEscPos();
  process.env.PRINTER_HOST='127.0.0.1';
  process.env.PRINTER_PORT=String(emulator.port);
  const printer=new ReceiptPrinter(service);
  await printer.dispatch();
  assert.equal(emulator.received.length,1,'Only first copy has reached the virtual printer');
  const first=service.receipts(cashier,order.order_id).find(x=>x.status==='SENT');
  const second=service.receipts(cashier,order.order_id).find(x=>x.status==='WAITING_FOR_PRINTER');
  assert.ok(first&&second,'First SENT, second still pending at paper-out boundary');
  assert.equal(first.attempts,1);
  assert.equal(second.attempts,0);

  await emulator.close();emulator=null; // Cut TCP transport before copy two.
  await printer.dispatch();
  const unknown=service.receipts(cashier,order.order_id).find(r=>r.id===second.id);
  assert.equal(unknown.status,'UNKNOWN');
  assert.equal(unknown.attempts,1);
  assert.equal(service.store.row("SELECT COUNT(*) n FROM receipt_print_attempts WHERE status='UNKNOWN'").n,1);
  const operational=service.operationalStatus(cashier);
  assert.equal(operational.printer.unknown_copies,1);
  assert.equal(operational.printer.unknown_receipts.length,1);
  assert.equal(operational.printer.unknown_receipts[0].id,second.id);

  // New StoreService on the same durable SQLite: simulates a stopped/restarted
  // print worker. This is NOT power-loss or physical paper detection.
  service.store.db.close();service=null;
  service=new StoreService();service.onModuleInit();
  const freshCashier=service.actor('Bearer '+
   service.login('cashier',process.env.BOOTSTRAP_CASHIER_PIN).token,['CASHIER']);
  emulator=await mockEscPos();process.env.PRINTER_PORT=String(emulator.port);
  const restartedPrinter=new ReceiptPrinter(service);
  await restartedPrinter.dispatch();await restartedPrinter.dispatch();
  assert.equal(emulator.received.length,0,'UNKNOWN must not be auto-sent on reboot/reconnect');
  assert.equal(service.receipts(freshCashier,order.order_id).find(r=>r.id===first.id).status,'SENT');
  assert.equal(service.receipts(freshCashier,order.order_id).find(r=>r.id===second.id).status,'UNKNOWN');

  // Authorized operator inspected the paper and explicitly reprints one copy.
  const key='q09-inspected-manual-reprint';
  const request=service.reprint(freshCashier,second.id,{reason:'Đã kiểm tra giấy, thiếu liên thứ hai'},key);
  assert.equal(request.status,'WAITING_FOR_PRINTER');
  assert.equal(request.attempts,1,'Queueing must NOT count as another printer send');
  assert.deepEqual(service.reprint(freshCashier,second.id,{
   reason:'Đã kiểm tra giấy, thiếu liên thứ hai',
  },key),request,'Same request/key must replay instead of queueing a second reprint');
  assert.throws(()=>service.reprint(freshCashier,second.id,{
   reason:'Nội dung lý do khác',
  },key),err=>err.code==='IDEMPOTENCY_PAYLOAD_MISMATCH');

  const active=service.receipts(freshCashier,order.order_id).find(r=>r.id===second.id);
  assert.equal(active.attempts,1);
  await restartedPrinter.dispatch();
  await restartedPrinter.dispatch();
  assert.equal(emulator.received.length,1,'Only the authorized second copy may be resent');
  assert.equal(emulator.received[0][0],0x1b);
  assert.equal(emulator.received[0][1],0x40);
  const after=service.receipts(freshCashier,order.order_id);
  assert.deepEqual(after.map(r=>r.status),['SENT','SENT']);
  assert.equal(after.find(r=>r.id===second.id).attempts,2,
   'One failed send + one manual retry = exactly two physical dispatch attempts');
  assert.equal(after.find(r=>r.id===first.id).attempts,1);
  assert.ok(buildReceiptLines({
   display_code:order.display_code,created_at:order.created_at,total_vnd:70_000,
   lines_json:JSON.stringify(order.items),
  },{kind:second.kind,attempts:1},{
   method:'CASH',amount_vnd:70_000,tendered_vnd:100_000,change_vnd:30_000,
  }).some(line=>line.left.includes('BẢN IN LẠI')));

  const db=service.store;
  assert.equal(db.row('SELECT COUNT(*) n FROM payments WHERE order_id=?',order.order_id).n,1);
  assert.equal(db.row('SELECT COUNT(*) n FROM receipts WHERE order_id=?',order.order_id).n,2);
  assert.equal(db.row('SELECT COUNT(*) n FROM receipt_print_attempts WHERE receipt_id=?',first.id).n,1);
  assert.equal(db.row('SELECT COUNT(*) n FROM receipt_print_attempts WHERE receipt_id=?',second.id).n,2);
  assert.equal(db.row("SELECT COUNT(*) n FROM receipt_print_attempts WHERE status='SENT'").n,2);
  assert.equal(db.row("SELECT COUNT(*) n FROM receipt_print_attempts WHERE status='UNKNOWN'").n,1);
  assert.equal(db.row("SELECT COUNT(*) n FROM audit WHERE kind='RECEIPT_REPRINT' AND entity_id=?",order.order_id).n,1);
  assert.equal(service.summary().cash_vnd,70_000);
  assert.equal(service.summary().bank_vnd,0);
  console.log('BMC_PRINTER_SECOND_COPY_FAULT '+JSON.stringify({
   firstCopy:'SENT transport-only',secondCopy:'UNKNOWN transport failure',
   workerRestart:'no automatic UNKNOWN replay',manualReprint:true,
   secondCopyActualSendAttempts:2,receiptIntents:2,settlements:1,
   environment:'virtual TCP printer; NO proof actual paper output or physical printer paper-out',
  }));
 }finally{
  if(emulator)await emulator.close();
  if(service)service.store.db.close();
  for(const [key,value] of Object.entries(saved)){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  rmSync(dir,{recursive:true,force:true});
 }
});
