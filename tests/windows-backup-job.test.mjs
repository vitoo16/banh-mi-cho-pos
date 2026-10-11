import {test} from 'node:test';
import assert from 'node:assert/strict';
import {spawnSync} from 'node:child_process';
import {mkdtempSync,mkdirSync,readdirSync,readFileSync,writeFileSync,rmSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {createRequire} from 'node:module';

const require=createRequire(import.meta.url);
const powershell=resolve('scripts/windows/run-store-backup.ps1');
const backupCli=resolve('scripts/store-backup.mjs');

test('Windows one-shot backup job requires explicit protected destination and detects corrupt archive',{
 skip:process.platform!=='win32',timeout:75_000,
},()=>{
 const dir=mkdtempSync(join(tmpdir(),'bmc-windows-job-'));
 const live=join(dir,'live.sqlite');
 const protectedDir=join(dir,'protected-storage-fixture');
 mkdirSync(protectedDir);
 const saved=Object.fromEntries(['STORE_DB_PATH','SEED_DEMO_CATALOG',
  'BOOTSTRAP_OWNER_PIN','BOOTSTRAP_CASHIER_PIN','BOOTSTRAP_STAFF_PIN']
  .map(k=>[k,process.env[k]]));
 let svc;
 try{
  process.env.STORE_DB_PATH=live;
  process.env.SEED_DEMO_CATALOG='1';
  process.env.BOOTSTRAP_OWNER_PIN='win-job-fixture-owner';
  process.env.BOOTSTRAP_CASHIER_PIN='win-job-fixture-cashier';
  process.env.BOOTSTRAP_STAFF_PIN='win-job-fixture-staff';
  const {StoreService}=require('../apps/store-hub/dist/service.js');
  svc=new StoreService();
  svc.onModuleInit();
  const invoke=(backupDir,ack)=>spawnSync('pwsh',[
   '-NoProfile','-NonInteractive','-File',powershell,
   '-StoreDbPath',live,'-BackupDirectory',backupDir,'-MaxAgeMinutes','15',
   ...(ack?['-AcknowledgedEncryptedDestination']:[]),
  ],{encoding:'utf8',timeout:30_000,windowsHide:true});
  const denied=invoke(protectedDir,false);
  assert.notEqual(denied.status,0,'Plaintext destination must require explicit operator acknowledgement');
  assert.equal(readdirSync(protectedDir).length,0);
  const missing=invoke(join(dir,'nonexistent'),true);
  assert.notEqual(missing.status,0,'Job must not invent/auto-create a storage directory');
  const sameDir=invoke(dir,true);
  assert.notEqual(sameDir.status,0,'Job must refuse to place snapshots next to live SQLite');
  assert.equal(readdirSync(protectedDir).length,0);

  for(let n=1;n<=2;n++){
   const ok=invoke(protectedDir,true);
   assert.equal(ok.status,0,ok.stderr||ok.stdout);
   const backups=readdirSync(protectedDir).filter(f=>f.endsWith('.sqlite'));
   const manifests=readdirSync(protectedDir).filter(f=>f.endsWith('.sqlite.manifest.json'));
   assert.equal(backups.length,n,'Each manual/scheduled run must create a unique name');
   assert.equal(manifests.length,n,'Each snapshot must have a verified manifest');
   for(const file of backups){
    const check=spawnSync(process.execPath,[backupCli,'verify',join(protectedDir,file)],{
     encoding:'utf8',timeout:15000,
    });
    assert.equal(check.status,0,check.stderr||check.stdout);
   }
  }
  // A new snapshot must not silently make a corrupted older archive look good.
  const first=readdirSync(protectedDir).find(f=>f.endsWith('.sqlite'));
  const bytes=readFileSync(join(protectedDir,first));
  const changed=Buffer.from(bytes);
  changed[changed.length-1]^=1;
  writeFileSync(join(protectedDir,first),changed);
  const failure=invoke(protectedDir,true);
  assert.notEqual(failure.status,0,'Inventory checker must reject corrupted previous snapshots');
 }finally{
  svc?.store?.db?.close();
  for(const [key,value] of Object.entries(saved)){
   if(value===undefined)delete process.env[key];else process.env[key]=value;
  }
  rmSync(dir,{recursive:true,force:true});
 }
});
