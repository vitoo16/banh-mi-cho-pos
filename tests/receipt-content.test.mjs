import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

test('two-copy receipt shows actual CASH payment legs, not requested intent',()=>{
 const {buildReceiptLines}=require('../apps/store-hub/dist/printer.js');
 const order={
  display_code:'B00099',created_at:'2026-10-11T03:20:00.000Z',total_vnd:90000,
  requested_method:'BANK', // Staff wanted BANK; cashier actually collected CASH.
  lines_json:JSON.stringify([{name_snapshot:'Bánh mì thịt',qty:2,line_total_vnd:90000,note:'Ít rau'}]),
 };
 const payment={method:'CASH',amount_vnd:90000,tendered_vnd:100000,change_vnd:10000};
 const customer=buildReceiptLines(order,{kind:'CUSTOMER',attempts:0},payment);
 const store=buildReceiptLines(order,{kind:'STORE',attempts:0},payment);
 assert.ok(customer.some(l=>l.left==='LIÊN KHÁCH'));
 assert.ok(store.some(l=>l.left==='LIÊN TIỆM'));
 assert.ok(customer.some(l=>l.left==='Hình thức'&&l.right==='Tiền mặt'));
 assert.ok(store.some(l=>l.left==='Hình thức'&&l.right==='Tiền mặt'));
 assert.ok(store.some(l=>l.left==='Khách đưa'&&l.right==='100.000đ'));
 assert.ok(store.some(l=>l.left==='Tiền thối'&&l.right==='10.000đ'));
 assert.ok(!customer.some(l=>l.left==='Khách đưa'));
 assert.ok(!customer.some(l=>l.left==='Tiền thối'));
 assert.ok(store.some(l=>l.left.includes('Ghi chú:')&&l.left.includes('Ít rau')));
 assert.ok(!customer.some(l=>l.left.includes('Ghi chú:')));
 assert.ok(store.every(l=>!l.left.includes('Chuyển khoản')));
});

test('verified BANK receipt never prints fake cash tender/change; both copies identify BANK',()=>{
 const {buildReceiptLines}=require('../apps/store-hub/dist/printer.js');
 const order={
  display_code:'B00100',created_at:'2026-10-11T03:20:00.000Z',total_vnd:90000,
  requested_method:'CASH', // Cash request is not the settlement source of truth.
  lines_json:JSON.stringify([{name_snapshot:'Bánh mì đặc biệt',qty:2,line_total_vnd:90000,note:''}]),
 };
 const bank={method:'BANK',amount_vnd:90000,tendered_vnd:null,change_vnd:null};
 for(const kind of ['CUSTOMER','STORE']){
  const lines=buildReceiptLines(order,{kind,attempts:0},bank);
  assert.ok(lines.some(l=>l.left==='Hình thức'&&l.right==='Chuyển khoản'));
  assert.ok(lines.some(l=>l.left==='Chuyển khoản xác minh'&&l.right==='90.000đ'));
  assert.ok(lines.some(l=>l.left==='TỔNG'&&l.right==='90.000đ'));
  assert.equal(lines.some(l=>l.left==='Khách đưa'||l.left==='Tiền thối'),false);
  assert.equal(lines.some(l=>l.right==='0đ'),false);
 }
 const reprint=buildReceiptLines(order,{kind:'STORE',attempts:1},bank);
 assert.ok(reprint.some(l=>l.left.includes('BẢN IN LẠI')));
});

test('a receipt without complete authoritative settlement stays UNKNOWN, never invents paid cash',()=>{
 const {buildReceiptLines}=require('../apps/store-hub/dist/printer.js');
 const order={display_code:'B00001',created_at:'2026-10-11T03:20:00.000Z',
  total_vnd:90000,lines_json:'[]'};
 const copy={kind:'STORE',attempts:0};
 assert.throws(()=>buildReceiptLines(order,copy,null),/RECEIPT_SETTLEMENT_INVALID/);
 assert.throws(()=>buildReceiptLines(order,copy,{method:'BANK',amount_vnd:80000,tendered_vnd:null,change_vnd:null}),/RECEIPT_SETTLEMENT_INVALID/);
 assert.throws(()=>buildReceiptLines(order,copy,{method:'CASH',amount_vnd:90000,tendered_vnd:null,change_vnd:null}),/RECEIPT_CASH_LEGS_INVALID/);
 assert.throws(()=>buildReceiptLines(order,copy,{method:'CASH',amount_vnd:90000,tendered_vnd:100000,change_vnd:9000}),/RECEIPT_CASH_LEGS_INVALID/);
 assert.throws(()=>buildReceiptLines(order,copy,{method:'MOMO',amount_vnd:90000,tendered_vnd:null,change_vnd:null}),/RECEIPT_SETTLEMENT_INVALID/);
});
