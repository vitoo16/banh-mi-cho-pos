import {test} from 'node:test';import assert from 'node:assert/strict';import {createHmac} from 'node:crypto';import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);
const {verifySepayWebhook,parseSepayTransfer,findExactMemoReference}=require('../apps/cloud-api/dist/sepay.js');
test('SePay webhook must HMAC-sign timestamp.raw_body and reject replay',()=>{
 const raw=Buffer.from('{"id":123,"accountNumber":"12345678","transferAmount":35000}');
 const secret='secret-for-unit-test-strong-12345678901',ts=String(Math.floor(Date.now()/1000));
 const sig='sha256='+createHmac('sha256',secret).update(ts+'.').update(raw).digest('hex');
 assert.equal(verifySepayWebhook(raw,sig,ts,secret),true);
 assert.equal(verifySepayWebhook(Buffer.from(raw.toString()+' '),sig,ts,secret),false);
 assert.equal(verifySepayWebhook(raw,sig,String(Number(ts)-600),secret),false);
 assert.equal(verifySepayWebhook(raw,sig.replace(/.$/,'0'),ts,secret),false);
 assert.equal(verifySepayWebhook(raw,sig,ts,'short'),false);
});
test('reference match exact and transfer fields validated',()=>{
 assert.equal(findExactMemoReference('mua ban BMC0123456789ABCDEF cam on','BMC0123456789ABCDEF',null),true);
 assert.equal(findExactMemoReference('mua ban BMC0123456789ABCDE0 cam on','BMC0123456789ABCDEF',null),false);
 assert.equal(findExactMemoReference('BMC0123456789ABCDEF BMC0123456789ABCDE0','BMC0123456789ABCDEF',null),false);
 assert.throws(()=>parseSepayTransfer({id:1,accountNumber:'123',transferType:'in',transferAmount:'35000',content:'memo'}));
 assert.equal(parseSepayTransfer({id:25,accountNumber:'12345678',transferType:'in',transferAmount:35000,content:'memo'}).id,25);
});
