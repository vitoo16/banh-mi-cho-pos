import {test} from 'node:test';
import assert from 'node:assert/strict';
import {classifyOrderCreateFailure,sameStagedCreateCommand} from '../packages/contracts/dist/index.js';

test('Staff never treats all HTTP 409 responses as safe unsent order errors',()=>{
 for(const code of ['IDEMPOTENCY_LEGACY_REVIEW','IDEMPOTENCY_PAYLOAD_MISMATCH','ORDER_SETTLED','INVALID_CURSOR','SOMETHING_NEW']){
  assert.equal(classifyOrderCreateFailure({status:409,code}), 'UNKNOWN_KEEP_DRAFT',code);
 }
 assert.equal(classifyOrderCreateFailure({status:409}), 'UNKNOWN_KEEP_DRAFT');
 assert.equal(classifyOrderCreateFailure({status:500,code:'INTERNAL_ERROR'}),'UNKNOWN_KEEP_DRAFT');
 assert.equal(classifyOrderCreateFailure({name:'AbortError'}),'UNKNOWN_KEEP_DRAFT');
 assert.equal(classifyOrderCreateFailure(new Error('Network failed')),'UNKNOWN_KEEP_DRAFT');
 assert.equal(classifyOrderCreateFailure(null),'UNKNOWN_KEEP_DRAFT');
});
test('only known pre-commit errors can discard a draft and ask staff to correct it',()=>{
 for(const code of ['CATALOG_CHANGED','PRODUCT_UNAVAILABLE'])
  assert.equal(classifyOrderCreateFailure({status:409,code}),'PRICE_REFRESH');
 for(const code of ['METHOD_DISABLED','EMPTY_ORDER','INVALID_PRODUCT','INVALID_QUANTITY','INVALID_TOTAL','INVALID_MONEY','INVALID_TEXT'])
  assert.equal(classifyOrderCreateFailure({status:400,code}),'EDIT_REVIEW',code);
});
test('staged create command cannot be overwritten by same key with changed payload or actor',()=>{
 const body={catalog_version:7,requested_payment_method:'CASH',items:[{product_id:'bm-thit',qty:2,note:'Không hành'}],note:'test'};
 const command={key:'mobile-durable-order-key-0001',staff_id:'staff',body};
 const stored={key:command.key,staff_id:command.staff_id,body_json:JSON.stringify(body)};
 assert.equal(sameStagedCreateCommand(stored,command),true);
 assert.equal(sameStagedCreateCommand(stored,{...command,staff_id:'other-staff'}),false);
 assert.equal(sameStagedCreateCommand(stored,{...command,key:'new-key'}),false);
 assert.equal(sameStagedCreateCommand(stored,{...command,body:{...body,items:[{product_id:'bm-thit',qty:3,note:'Không hành'}]}}),false);
 assert.equal(sameStagedCreateCommand(stored,{...command,body:{...body,requested_payment_method:'BANK'}}),false);
});
