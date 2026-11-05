import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {spawn} from 'node:child_process';
import {existsSync,mkdtempSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';

const require=createRequire(import.meta.url);
const {assertHubNetworkPolicy}=require('../apps/store-hub/dist/network-policy.js');

test('HUB-NET-01: loopback remains available without LAN TLS or pairing',()=>{
 assert.doesNotThrow(()=>assertHubNetworkPolicy({
  host:'127.0.0.1',tlsConfigured:false,pairingEnforced:false,
  allowInsecureLanDev:false,nodeEnv:'production',
 }));
 assert.doesNotThrow(()=>assertHubNetworkPolicy({
  host:'::1',tlsConfigured:false,pairingEnforced:false,
  allowInsecureLanDev:false,nodeEnv:'development',
 }));
});

test('HUB-NET-02: remote bind requires both trusted TLS and staff device pairing in production',()=>{
 assert.doesNotThrow(()=>assertHubNetworkPolicy({
  host:'0.0.0.0',tlsConfigured:true,pairingEnforced:true,
  allowInsecureLanDev:false,nodeEnv:'production',
 }));
 assert.throws(()=>assertHubNetworkPolicy({
  host:'0.0.0.0',tlsConfigured:false,pairingEnforced:true,
  allowInsecureLanDev:false,nodeEnv:'production',
 }),/trusted TLS/);
 assert.throws(()=>assertHubNetworkPolicy({
  host:'0.0.0.0',tlsConfigured:true,pairingEnforced:false,
  allowInsecureLanDev:false,nodeEnv:'production',
 }),/PAIRING_ENFORCED/);
});

test('HUB-NET-03: insecure LAN development override bypasses TLS only, never pairing',()=>{
 assert.doesNotThrow(()=>assertHubNetworkPolicy({
  host:'192.168.1.20',tlsConfigured:false,pairingEnforced:true,
  allowInsecureLanDev:true,nodeEnv:'development',
 }));
 assert.throws(()=>assertHubNetworkPolicy({
  host:'192.168.1.20',tlsConfigured:false,pairingEnforced:false,
  allowInsecureLanDev:true,nodeEnv:'development',
 }),/PAIRING_ENFORCED/);
 assert.throws(()=>assertHubNetworkPolicy({
  host:'192.168.1.20',tlsConfigured:true,pairingEnforced:false,
  allowInsecureLanDev:true,nodeEnv:'development',
 }),/PAIRING_ENFORCED/);
});

test('HUB-NET-04: insecure LAN override fails closed unless NODE_ENV is explicitly development',()=>{
 for(const nodeEnv of ['production','test',undefined]){
  assert.throws(()=>assertHubNetworkPolicy({
   host:'127.0.0.1',tlsConfigured:false,pairingEnforced:false,
   allowInsecureLanDev:true,nodeEnv,
  }),/NODE_ENV=development/);
 }
});

test('HUB-NET-05: production insecure-LAN override is rejected before SQLite opens',{
 timeout:15_000,
},async()=>{
 const temp=mkdtempSync(join(tmpdir(),'bmc-hub-network-policy-'));
 const dbPath=join(temp,'must-not-be-created.sqlite');
 const entry=resolve('apps/store-hub/dist/main.js');
 let child;
 let stdout='';
 let stderr='';
 try{
  child=spawn(process.execPath,[entry],{
   cwd:temp,
   windowsHide:true,
   env:{
    ...process.env,
    NODE_ENV:'production',
    HUB_BIND_HOST:'0.0.0.0',
    HUB_PORT:'0',
    PAIRING_ENFORCED:'0',
    ALLOW_INSECURE_LAN_DEV:'1',
    STORE_DB_PATH:dbPath,
    BANK_BRIDGE_SECRET:'',
    CLOUD_SYNC_URL:'',
    PRINTER_HOST:'',
    DOTENV_CONFIG_PATH:join(temp,'empty.env'),
   },
   stdio:['ignore','pipe','pipe'],
  });
  child.stdout.on('data',chunk=>{stdout+=chunk.toString()});
  child.stderr.on('data',chunk=>{stderr+=chunk.toString()});
  const result=await new Promise((resolve,reject)=>{
   const timeout=setTimeout(()=>{child.kill('SIGKILL');reject(new Error('Hub startup did not reject invalid policy'));},10_000);
   child.once('error',error=>{clearTimeout(timeout);reject(error)});
   child.once('exit',(code,signal)=>{clearTimeout(timeout);resolve({code,signal})});
  });
  assert.notEqual(result.code,0,'invalid production override must fail startup');
  assert.match(stderr,/NODE_ENV=development/,'startup must report the environment restriction');
  assert.equal(existsSync(dbPath),false,'network policy must reject before StoreService creates the SQLite database');
 }finally{
  if(child&&child.exitCode===null&&child.signalCode===null)child.kill('SIGKILL');
  rmSync(temp,{recursive:true,force:true});
 }
});
