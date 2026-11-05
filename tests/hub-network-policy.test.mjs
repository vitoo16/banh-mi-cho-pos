import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';

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
