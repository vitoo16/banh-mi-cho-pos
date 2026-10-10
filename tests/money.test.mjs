import {test} from 'node:test';import assert from 'node:assert/strict';
import {ensureMoney,ensureQty,makeCashSettlement,closingCash} from '../apps/store-hub/src/domain.ts';
test('exact integer money, never float or negative',()=>{assert.equal(ensureMoney(100000),100000);for(const bad of [NaN,Infinity,-1,10.1,Number.MAX_SAFE_INTEGER+1,'100'])assert.throws(()=>ensureMoney(bad));});
test('cash tender/change exact, insufficient cash rejected',()=>{assert.deepEqual(makeCashSettlement(35000,100000),{tendered:100000,change:65000,net:35000});assert.throws(()=>makeCashSettlement(35000,34000));});
test('cash drawer movements and qty validation',()=>{assert.equal(closingCash(1000000,[100000,-65000,-20000]),1015000);assert.equal(ensureQty(7),7);assert.throws(()=>ensureQty(0));});
