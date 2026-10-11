#!/usr/bin/env node
/**
 * Q-12 read-only backup inventory and freshness check for an operator/scheduler.
 * Checks ALL discovered backup pairs; never deletes, restores, or writes to SQLite.
 * WARNING: SHA-256 + plaintext sidecar is NOT cryptographic provenance.
 */
import {readdirSync,readFileSync,statSync} from 'node:fs';
import {resolve,join} from 'node:path';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const suffix='.sqlite.manifest.json';
const sqliteSuffix='.sqlite';
const verifyScript=resolve('scripts/store-backup.mjs');

export function assessBackupDirectory(directory,maxAgeMinutes,now=Date.now(),verify=verifyBackup) {
 if(!Number.isSafeInteger(maxAgeMinutes)||maxAgeMinutes<1||maxAgeMinutes>10080)
  throw Error('Max age must be an integer from 1 to 10080 minutes');
 if(!Number.isFinite(now))throw Error('Invalid inspection timestamp');
 const names=readdirSync(directory,{withFileTypes:true});
 const sqlite=names.filter(e=>e.isFile()&&e.name.endsWith(sqliteSuffix)).map(e=>e.name);
 const manifests=names.filter(e=>e.isFile()&&e.name.endsWith(suffix)).map(e=>e.name);
 const sqliteSet=new Set(sqlite);
 const manifestSet=new Set(manifests);
 const failures=[];
 const snapshots=[];
 for(const sidecar of manifests){
  const file=sidecar.slice(0,-'.manifest.json'.length);
  if(!sqliteSet.has(file))failures.push('Orphan manifest: '+sidecar);
 }
 for(const name of sqlite){
  const sidecar=name+'.manifest.json';
  if(!manifestSet.has(sidecar)){
   failures.push('Missing manifest: '+name);
   continue;
  }
  const path=join(directory,name);
  try{
   const raw=readFileSync(join(directory,sidecar));
   if(raw.length>8192)throw Error('Manifest exceeds 8 KiB limit');
   const manifest=JSON.parse(raw.toString('utf8'));
   // Never trust sidecar contents without the full SHA/integrity/row-count check.
   verify(path);
   const timestamp=Date.parse(manifest.snapshot_at);
   if(!Number.isFinite(timestamp))throw Error('Invalid snapshot timestamp');
   if(timestamp>now+120000)throw Error('Snapshot timestamp is over 2 minutes in the future');
   const ageMinutes=(now-timestamp)/60000;
   snapshots.push({file:name,ageMinutes,timestamp});
  }catch(error){
   failures.push('Invalid backup pair '+name+': '+String(error.message||error).slice(0,180));
  }
 }
 if(sqlite.length===0)failures.push('No .sqlite backups found');
 const newest=snapshots.sort((a,b)=>b.timestamp-a.timestamp)[0];
 if(!newest)failures.push('No verified backup available');
 else if(newest.ageMinutes>maxAgeMinutes)
  failures.push('Newest verified backup is stale ('+newest.ageMinutes.toFixed(1)+
   ' minutes > '+maxAgeMinutes+')');
 return {
  ok:failures.length===0,
  examined:sqlite.length,
  verified:snapshots.length,
  maxAgeMinutes,
  newestAgeMinutes:newest?Number(newest.ageMinutes.toFixed(2)):null,
  newestFile:newest?.file??null,
  failures,
 };
}
function verifyBackup(file){
 const result=spawnSync(process.execPath,[verifyScript,'verify',file],{
  encoding:'utf8',timeout:30000,windowsHide:true,
 });
 if(result.error)throw result.error;
 if(result.status!==0)throw Error(
  'verify failed: '+(result.stderr||'unknown verification failure').trim().split('\n').at(-1)
 );
}
if(process.argv[1]&&resolve(process.argv[1])===fileURLToPath(import.meta.url)){
 // Script invoked directly: reject missing or ill-typed arguments.
 const directoryArg=process.argv[2];
 const minutesArg=process.argv[3];
 if(!directoryArg||!minutesArg||!/^\d+$/.test(minutesArg)||process.argv.length!==4){
  console.error('Usage: node scripts/check-backup-freshness.mjs <BACKUP_DIRECTORY> <MAX_AGE_MINUTES>');
  process.exitCode=2;
 }else{
  try{
   const result=assessBackupDirectory(resolve(directoryArg),Number(minutesArg));
   console.log(JSON.stringify(result));
   if(!result.ok)process.exitCode=1;
  }catch(error){
   console.error('Backup freshness check failed: '+String(error.message||error));
   process.exitCode=1;
  }
 }
}
