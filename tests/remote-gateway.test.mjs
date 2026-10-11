import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync} from 'node:fs';
import {join} from 'node:path';
import {tmpdir} from 'node:os';
import {createRequire} from 'node:module';
const require=createRequire(import.meta.url);

test('LAN gateway permits only session-bound paired STAFF order traffic',()=>{
 const dir=mkdtempSync(join(tmpdir(),'bmc-lan-gateway-'));
 const keys=['STORE_DB_PATH','SEED_DEMO_CATALOG','PAIRING_ENFORCED','BOOTSTRAP_OWNER_PIN','BOOTSTRAP_CASHIER_PIN','BOOTSTRAP_STAFF_PIN'];
 const prev=Object.fromEntries(keys.map(k=>[k,process.env[k]]));
 try{
  process.env.STORE_DB_PATH=join(dir,'gateway.sqlite');
  process.env.SEED_DEMO_CATALOG='1';
  process.env.PAIRING_ENFORCED='1';
  process.env.BOOTSTRAP_OWNER_PIN='test-gateway-owner-pin';
  process.env.BOOTSTRAP_CASHIER_PIN='test-gateway-cashier-pin';
  process.env.BOOTSTRAP_STAFF_PIN='test-gateway-staff-pin';
  const {StoreService}=require('../apps/store-hub/dist/service.js');
  const {assertRemoteStaffRequest:gate}=require('../apps/store-hub/dist/remote-gateway.js');
  const s=new StoreService();s.onModuleInit();
  const ownerLogin=s.login('owner',process.env.BOOTSTRAP_OWNER_PIN);
  const owner=s.actor('Bearer '+ownerLogin.token,['OWNER']);
  const pair=s.issuePairing(owner,'Android test device','gateway-pair-0001');
  const staffLogin=s.login('staff',process.env.BOOTSTRAP_STAFF_PIN,pair.pairing_code);
  assert.equal(typeof staffLogin.device_token,'string');
  const staffAuth='Bearer '+staffLogin.token,device=staffLogin.device_token;
  const remote='192.168.10.24';
  const permit=(method,path,auth=staffAuth,token=device,body=undefined)=>gate(s,remote,method,path,auth,token,body);
  assert.doesNotThrow(()=>permit('GET','/v1/catalog?limit=20'));
  assert.doesNotThrow(()=>permit('GET','/v1/orders/history?cursor=x'));
  assert.doesNotThrow(()=>permit('POST','/v1/orders'));
  assert.doesNotThrow(()=>permit('POST','/v1/auth/logout'));
  assert.doesNotThrow(()=>permit('POST','/v1/auth/login',undefined,undefined,{user_id:'staff'}));
  assert.doesNotThrow(()=>permit('GET','/v1/health',undefined,undefined));
  assert.doesNotThrow(()=>permit('OPTIONS','/v1/orders',undefined,undefined));
  assert.doesNotThrow(()=>gate(s,'127.0.0.1','GET','/v1/owner/dashboard','Bearer '+ownerLogin.token,undefined));
  for(const id of ['owner','cashier','unknown'])
   assert.throws(()=>permit('POST','/v1/auth/login',undefined,undefined,{user_id:id}),e=>e.code==='REMOTE_STAFF_ONLY');
  for(const path of ['/v1/owner/dashboard','/v1/cash-shifts/current','/v1/internal/bank-events','/v1/orders/not-an-id/../owner/dashboard','/v1/orders/123%2fowner','/v1/orders/aaa/payments/cash'])
   assert.throws(()=>permit('GET',path),e=>e.code==='REMOTE_ROUTE_FORBIDDEN',path);
  assert.throws(()=>permit('POST','/v1/orders/1/payments/cash'),e=>e.code==='REMOTE_ROUTE_FORBIDDEN');
  assert.throws(()=>permit('GET','/v1/catalog','Bearer '+ownerLogin.token,device),e=>e.code==='FORBIDDEN');
  assert.throws(()=>permit('GET','/v1/catalog',staffAuth,undefined),e=>e.code==='DEVICE_NOT_TRUSTED');
  assert.throws(()=>permit('GET','/v1/catalog','Bearer wrong-session',device),e=>e.code==='SESSION_EXPIRED');
  const id=s.devices().find(d=>d.user_id==='staff').id;
  s.revokeDevice(owner,id,'Lost device','gateway-revoke-0001');
  assert.throws(()=>permit('GET','/v1/catalog'),e=>['SESSION_EXPIRED','DEVICE_NOT_TRUSTED'].includes(e.code));
  assert.throws(()=>permit('POST','/v1/auth/logout'),e=>['SESSION_EXPIRED','DEVICE_NOT_TRUSTED'].includes(e.code));
 }finally{
  for(const [k,v] of Object.entries(prev))if(v===undefined)delete process.env[k];else process.env[k]=v;
  rmSync(dir,{recursive:true,force:true});
 }
});
