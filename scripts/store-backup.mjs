#!/usr/bin/env node
/** Safe SQLite backup and restore COPY for Bánh Mì Chợ Store Hub.
 * Never overwrites a live database. An operator must stop POS and manually
 * switch paths only after a complete rehearsal and financial reconciliation.
 */
import {DatabaseSync} from 'node:sqlite';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {existsSync,mkdirSync,statSync,copyFileSync,rmSync,openSync,closeSync,fsyncSync,chmodSync,constants} from 'node:fs';
import {resolve,dirname} from 'node:path';

const mode=process.argv[2];
const live=resolve(process.env.STORE_DB_PATH||'./store-data/bmc.sqlite');
const defaultBackup=resolve('./store-backups/backup-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+Date.now()+'.sqlite');
const first=resolve(process.argv[3]||defaultBackup);
const second=process.argv[4]?resolve(process.argv[4]):null;
const requiredTables=['orders','payments','receipts','sync_outbox','idempotency','audit'];
if(!['backup','verify','restore-copy'].includes(mode)){
 console.error('Usage: backup <new-backup.sqlite> | verify <backup.sqlite> | restore-copy <backup.sqlite> <NEW-sandbox.sqlite>');
 process.exit(2);
}
if(mode==='restore-copy'&&!second)throw Error('restore-copy requires a NEW destination filename');

function inspect(file){
 if(!existsSync(file)||statSync(file).size<4096)throw Error('Missing, corrupt or undersized SQLite file: '+file);
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  const result=db.prepare('PRAGMA integrity_check').all();
  if(result.length!==1||result[0].integrity_check!=='ok')throw Error('SQLite integrity_check failed for '+file);
  const foreign=db.prepare('PRAGMA foreign_key_check').all();
  if(foreign.length)throw Error('Foreign key violation in '+file);
  for(const table of requiredTables){
   const present=db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get('table',table);
   if(!present)throw Error('Not a complete Bánh Mì Chợ Store Hub database: missing '+table);
  }
  return Object.fromEntries(['orders','payments','receipts','sync_outbox'].map(
   table=>[table,Number(db.prepare('SELECT COUNT(*) n FROM "'+table+'"').get().n)]));
 }finally{db.close()}
}
async function sha256(file){
 const digest=createHash('sha256');
 for await(const chunk of createReadStream(file))digest.update(chunk);
 return digest.digest('hex');
}
const confidentialWarning='WARNING: this is a PLAINTEXT SQLite file. Protect it with approved encrypted storage and access controls.';
if(mode==='backup'){
 if(!existsSync(live))throw Error('Store Hub SQLite database does not exist: '+live);
 if(live===first||existsSync(first))throw Error('Refusing to overwrite the live store or an existing backup');
 mkdirSync(dirname(first),{recursive:true});
 inspect(live);
 const connection=new DatabaseSync(live);
 let created=false;
 try{
  // VACUUM INTO produces a consistent, standalone snapshot even while WAL is active.
  connection.exec("VACUUM INTO '"+first.replaceAll("'","''")+"'");
  created=true;
  const snapshot=inspect(first);
  try{chmodSync(first,0o600)}catch{/* Windows ACLs must be configured separately */}
  console.log('Verified SQLite backup:',first,JSON.stringify(snapshot));
  console.warn(confidentialWarning);
 }catch(error){if(created||existsSync(first))rmSync(first,{force:true});throw error}
 finally{connection.close()}
}else if(mode==='verify'){
 const counts=inspect(first);
 console.log('SQLite backup verified:',first,JSON.stringify(counts));
}else{
 if(first===live)throw Error('Do not restore-copy from a live SQLite database. First create a standalone VACUUM backup.');
 if(second===live)throw Error('Refusing to replace active Store Hub database. Restore COPY to an unused path.');
 if(first===second||existsSync(second))throw Error('Restore COPY destination must not exist or match source');
 const before=inspect(first);
 mkdirSync(dirname(second),{recursive:true});
 let copied=false;
 try{
  // COPYFILE_EXCL avoids clobbering an existing financial ledger, even across repeated commands.
  copyFileSync(first,second,constants.COPYFILE_EXCL);copied=true;
  try{chmodSync(second,0o600)}catch{/* Apply appropriate Windows file ACLs */}
  const handle=openSync(second,'r');try{fsyncSync(handle)}finally{closeSync(handle)}
  const after=inspect(second);
  for(const key of Object.keys(before))if(after[key]!==before[key])throw Error('Restored '+key+' count mismatch');
  if(await sha256(first)!==await sha256(second))throw Error('Restored backup SHA-256 mismatch');
  console.log('Verified RESTORE COPY:',second,JSON.stringify(after));
  console.warn('This is NOT an in-place restore. Stop Store Hub, preserve the original files including -wal/-shm, and reconcile every transaction before any cutover.');
  console.warn(confidentialWarning);
 }catch(error){if(copied)rmSync(second,{force:true});throw error}
}
