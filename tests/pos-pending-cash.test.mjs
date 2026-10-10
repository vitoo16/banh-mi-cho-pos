import {test} from 'node:test';
import assert from 'node:assert/strict';
import {readPendingCash,stagePendingCash,clearPendingCash,pendingCashStorageKey} from '../apps/web-pos/src/pendingCash.ts';
function storage(){
 const m=new Map();
 return {getItem:k=>m.get(k)??null,setItem:(k,v)=>m.set(k,v),removeItem:k=>m.delete(k),_m:m};
}
const sample={key:'00000000-0000-4000-8000-000000000001',cashier_id:'cashier01',order_id:'order-0000000001',
 shift_id:'shift-0000000001',cash_tendered_vnd:100000,expected_order_version:1,created_at:1791648000000};
test('POS crash-recovery intent persists exact payload and blocks a second cash capture',()=>{
 const store=storage();
 assert.equal(readPendingCash(store),null);
 stagePendingCash(store,sample);
 assert.deepEqual(readPendingCash(store),sample);
 assert.deepEqual(readPendingCash(store),sample,'same state after a simulated page restart');
 stagePendingCash(store,sample);
 assert.throws(()=>stagePendingCash(store,{...sample,key:'00000000-0000-4000-8000-000000000002'}),/chưa rõ kết quả/);
 assert.throws(()=>stagePendingCash(store,{...sample,cash_tendered_vnd:200000}),/Không được thay đổi/);
 assert.throws(()=>clearPendingCash(store,'00000000-0000-4000-8000-000000000002'),/một yêu cầu thu tiền khác/);
 assert.deepEqual(readPendingCash(store),sample);
 clearPendingCash(store,sample.key);
 assert.equal(readPendingCash(store),null);
});
test('corrupt or unavailable local storage fails closed; cannot silently discard a cash event',()=>{
 const store=storage();
 store.setItem(pendingCashStorageKey,'{not-json');
 assert.throws(()=>readPendingCash(store),/bị hỏng/);
 assert.throws(()=>stagePendingCash(store,sample),/bị hỏng/);
 store.setItem(pendingCashStorageKey,JSON.stringify({...sample,cash_tendered_vnd:0}));
 assert.throws(()=>readPendingCash(store),/bị hỏng/);
 const denied={getItem:()=>null,setItem:()=>{throw new Error('disk full')}};
 assert.throws(()=>stagePendingCash(denied,sample),/disk full/);
});
