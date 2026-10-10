import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';import {tmpdir} from 'node:os';import {join} from 'node:path';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
test('Store Hub: price snapshots, idempotency, exact change, shift and guards',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bmc-test-'));
 try{
  process.env.STORE_DB_PATH=join(dir,'shop.sqlite');process.env.BOOTSTRAP_OWNER_PIN='owner-secure-123';process.env.BOOTSTRAP_CASHIER_PIN='cashier-secure-456';process.env.BOOTSTRAP_STAFF_PIN='staff-secure-789';process.env.SEED_DEMO_CATALOG='1';
  const {StoreService}=require('../apps/store-hub/dist/service.js'),s=new StoreService();s.onModuleInit();
  const staffSession=s.login('staff','staff-secure-789');
  const staff=s.actor('Bearer '+staffSession.token,['STAFF']);
  const extra=s.login('staff','staff-secure-789');
  assert.deepEqual(s.logout('Bearer '+extra.token),{ok:true});
  assert.throws(()=>s.actor('Bearer '+extra.token),e=>e.code==='SESSION_EXPIRED');
  const cashier=s.actor('Bearer '+s.login('cashier','cashier-secure-456').token,['CASHIER']);
  const owner=s.actor('Bearer '+s.login('owner','owner-secure-123').token,['OWNER']);
  assert.throws(()=>s.actor('Bearer '+s.login('staff','staff-secure-789').token,['OWNER']),e=>e.code==='FORBIDDEN');
  s.addEmployee(owner,{id:'temp123',name:'Temp',role:'STAFF',pin:'temppin123'},'create-temp-001');
  const tempToken=s.login('temp123','temppin123').token;
  s.setEmployeeActive(owner,'temp123',{active:false},'disable-temp-001');
  assert.throws(()=>s.actor('Bearer '+tempToken),e=>e.code==='SESSION_EXPIRED');
  for(let i=0;i<5;i++)assert.throws(()=>s.login('staff','wrong-pin'),e=>e.code==='AUTH_FAILED');
  assert.throws(()=>s.login('staff','staff-secure-789'),e=>e.code==='TOO_MANY_ATTEMPTS');
  // Failed-login counters live in SQLite, not process memory.
  const {StoreService:Reload}=require('../apps/store-hub/dist/service.js');
  const rebooted=new Reload();assert.throws(()=>rebooted.login('staff','staff-secure-789'),e=>e.code==='TOO_MANY_ATTEMPTS');
  s.store.run('DELETE FROM login_attempts WHERE user_id=?','staff');
  const menu=s.catalog();assert.equal(menu.products.length,4);
  const bread=menu.products.find(p=>p.id==='bm-thit');
  const input={catalog_version:menu.version,requested_payment_method:'BANK',items:[{product_id:bread.id,qty:2,note:'Không hành'}]};
  const order=s.createOrder(staff,input,'create-idempotency-test-001');
  assert.equal(order.total_vnd,70000);assert.equal(order.payment_status,'UNPAID');
  assert.deepEqual(s.createOrder(staff,input,'create-idempotency-test-001'),order);
  assert.throws(()=>s.createOrder(staff,{...input,requested_payment_method:'MOMO'},'create-other-002'),e=>e.code==='METHOD_DISABLED');
  const sh=s.openShift(cashier,{opening_float_vnd:1000000},'shift-open-001');
  assert.equal(sh.expected_cash_vnd,1000000);
  assert.throws(()=>s.cash(cashier,order.order_id,{shift_id:sh.id,cash_tendered_vnd:60000,expected_order_version:1},'cash-short-001'),/INSUFFICIENT_CASH/);
  const capture=s.cash(cashier,order.order_id,{shift_id:sh.id,cash_tendered_vnd:100000,expected_order_version:1},'cash-pay-001');
  assert.equal(capture.cash_change_vnd,30000);assert.equal(capture.cash_net_vnd,70000);
  assert.deepEqual(s.cash(cashier,order.order_id,{shift_id:sh.id,cash_tendered_vnd:100000,expected_order_version:1},'cash-pay-001'),capture);
  assert.equal(s.getShift(sh.id).expected_cash_vnd,1070000);
  assert.equal(s.receipts(cashier,order.order_id).length,2);
  assert.throws(()=>s.cash(cashier,order.order_id,{shift_id:sh.id,cash_tendered_vnd:100000,expected_order_version:1},'cash-pay-new-002'),e=>e.code==='ORDER_SETTLED');
  assert.equal(s.summary().net_revenue_vnd,70000);
  assert.equal(s.summary().bank_vnd,0);
  const paidOrder=s.order(staff,order.order_id);assert.equal(paidOrder.payment_status,'PAID');
  const amended=s.updateProduct(owner,bread.id,{name:'Bánh mì thịt nguội mới',price_vnd:42000,is_active:true},'price-edit-001');assert.equal(amended.price_vnd,42000);
  assert.equal(s.order(staff,order.order_id).items[0].unit_price_vnd,35000);
  assert.throws(()=>s.createOrder(staff,input,'stale-catalog-001'),e=>e.code==='CATALOG_CHANGED');
  s.movement(cashier,sh.id,{kind:'WITHDRAW',amount_vnd:20000,reason:'Chủ rút tiền'},'withdraw-001');
  assert.equal(s.getShift(sh.id).expected_cash_vnd,1050000);
  assert.throws(()=>s.closeShift(cashier,sh.id,{counted_cash_vnd:1030000,reason:''},'close-no-reason-001'),e=>e.code==='REASON_REQUIRED');
  const afterMenu=s.catalog();
  const voidedOrder=s.createOrder(staff,{catalog_version:afterMenu.version,requested_payment_method:'CASH',items:[{product_id:bread.id,qty:1}]},'cancel-created-001');
  const voided=s.voidOrder(cashier,voidedOrder.order_id,{reason:'Khách đổi ý'},'cancel-voided-001');
  assert.equal(voided.status,'VOIDED');
  assert.throws(()=>s.cash(cashier,voidedOrder.order_id,{shift_id:sh.id,cash_tendered_vnd:50000,expected_order_version:2},'cash-voided-001'),e=>e.code==='ORDER_SETTLED');
  assert.equal(s.summary().pending_orders,0);
  const bankOrder=s.createOrder(staff,{catalog_version:s.catalog().version,requested_payment_method:'BANK',items:[{product_id:bread.id,qty:1}]},'bank-order-create-001');
  process.env.BANK_ACCOUNT_NUMBER='123456789';process.env.BANK_CODE='DEMO_BANK';process.env.BANK_BRIDGE_SECRET='0123456789abcdef0123456789abcdef';
  const intent=s.bankIntent(cashier,bankOrder.order_id,'bank-intent-test-01');
  assert.equal(intent.status,'PENDING');
  const {createHmac}=require('node:crypto');const stamp=String(Date.now());
  const event={provider_tx_id:'provider-transaction-0001',reference:intent.reference,bank_code:'DEMO_BANK',account_number:'123456789',amount_vnd:40000,direction:'CREDIT'};
  const signed=(e)=>createHmac('sha256',process.env.BANK_BRIDGE_SECRET).update(stamp+'.'+JSON.stringify(e)).digest('hex');
  assert.throws(()=>s.bankEvent(JSON.stringify(event),stamp,'bad'),e=>e.code==='INVALID_SIGNATURE');
  const wrong=s.bankEvent(JSON.stringify(event),stamp,signed(event));assert.equal(wrong.state,'EXCEPTION');
  assert.equal(s.order(staff,bankOrder.order_id).payment_status,'UNPAID');
  const correct={...event,provider_tx_id:'provider-transaction-0002'};
  const ok=s.bankEvent(JSON.stringify(correct),stamp,signed(correct));assert.equal(ok.state,'EXCEPTION'); // wrong amount remains held
  assert.equal(s.bankExceptions().length,2);
  const paid={...event,provider_tx_id:'provider-transaction-0003',amount_vnd:42000};
  // Correct exact payment matches the updated price, while earlier mismatches stay exceptions.
  const settled=s.bankEvent(JSON.stringify(paid),stamp,signed(paid));assert.equal(settled.state,'CONFIRMED');
  assert.equal(s.order(staff,bankOrder.order_id).payment_status,'PAID');
  assert.equal(s.bankEvent(JSON.stringify(paid),stamp,signed(paid)).duplicate,true);
  assert.equal(s.receipts(cashier,bankOrder.order_id).length,2);
  assert.throws(()=>s.refundCash(cashier,bankOrder.order_id,{shift_id:sh.id,reason:'Yêu cầu đổi hàng'},'refund-bank-refused-001'),e=>e.code==='REFUND_METHOD_UNSUPPORTED');
  const refund=s.refundCash(cashier,order.order_id,{shift_id:sh.id,reason:'Khách trả hàng'},'cash-refund-001');
  assert.equal(refund.amount_vnd,70000);
  assert.equal(s.refundCash(cashier,order.order_id,{shift_id:sh.id,reason:'Khách trả hàng'},'cash-refund-001').refund_id,refund.refund_id);
  assert.equal(s.order(staff,order.order_id).payment_status,'REFUNDED');
  assert.equal(s.summary().cash_vnd,0);
  assert.equal(s.getShift(sh.id).expected_cash_vnd,980000);
  const closed=s.closeShift(cashier,sh.id,{counted_cash_vnd:960000,reason:'Thiếu 20k sau kiểm đếm'},'close-001');
  assert.equal(closed.variance_vnd,-20000);
  assert.throws(()=>s.movement(cashier,sh.id,{kind:'ADD',amount_vnd:20000,reason:'Sửa quỹ'},'after-close-001'),e=>e.code==='INVALID_SHIFT');
 }finally{rmSync(dir,{recursive:true,force:true})}
});

test('pair code one-time use, device-bound Staff sessions, restart and Owner revocation',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bmc-pair-'));
 const old={path:process.env.STORE_DB_PATH,pair:process.env.PAIRING_ENFORCED};
 try{
  process.env.STORE_DB_PATH=join(dir,'pairing.sqlite');process.env.PAIRING_ENFORCED='1';
  process.env.BOOTSTRAP_OWNER_PIN='secure-owner-test';process.env.BOOTSTRAP_CASHIER_PIN='secure-cashier-test';process.env.BOOTSTRAP_STAFF_PIN='secure-staff-test';process.env.SEED_DEMO_CATALOG='1';
  const {StoreService}=require('../apps/store-hub/dist/service.js');const s=new StoreService();s.onModuleInit();
  const owner=s.actor('Bearer '+s.login('owner','secure-owner-test').token,['OWNER']);
  assert.throws(()=>s.login('staff','secure-staff-test'),e=>e.code==='DEVICE_PAIRING_REQUIRED');
  const issued=s.issuePairing(owner,'Máy nhân viên 01','pairing-issue-001');
  assert.equal(issued.pairing_code.length,16);
  assert.throws(()=>s.login('staff','secure-staff-test','FFFFFFFFFFFFFFFF'),e=>e.code==='DEVICE_PAIRING_REQUIRED');
  const session=s.login('staff','secure-staff-test',issued.pairing_code);
  assert.ok(session.device_token);
  assert.ok(s.actor('Bearer '+session.token,['STAFF'],session.device_token));
  assert.throws(()=>s.actor('Bearer '+session.token,['STAFF'],'stolen-wrong-token'),e=>e.code==='DEVICE_NOT_TRUSTED');
  assert.throws(()=>s.login('staff','secure-staff-test',issued.pairing_code),e=>e.code==='DEVICE_PAIRING_REQUIRED');
  const relogin=s.login('staff','secure-staff-test',undefined,session.device_token);
  assert.ok(s.actor('Bearer '+relogin.token,['STAFF'],session.device_token));
  const db2=new StoreService(); // persisted device pairing and tokens survive process restart
  assert.ok(db2.actor('Bearer '+relogin.token,['STAFF'],session.device_token));
  const device=s.devices()[0];
  assert.equal(device.user_id,'staff');
  assert.deepEqual(s.revokeDevice(owner,device.id,'Điện thoại bị mất','revoke-pair-001'),{ok:true,revoked:true});
  assert.throws(()=>s.actor('Bearer '+relogin.token,['STAFF'],session.device_token),e=>e.code==='SESSION_EXPIRED');
  assert.throws(()=>s.login('staff','secure-staff-test',undefined,session.device_token),e=>e.code==='DEVICE_PAIRING_REQUIRED');
 }finally{
  if(old.path===undefined)delete process.env.STORE_DB_PATH;else process.env.STORE_DB_PATH=old.path;
  if(old.pair===undefined)delete process.env.PAIRING_ENFORCED;else process.env.PAIRING_ENFORCED=old.pair;
  rmSync(dir,{recursive:true,force:true});
 }
});
