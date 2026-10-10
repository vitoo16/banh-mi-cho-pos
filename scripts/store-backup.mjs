#!/usr/bin/env node
/** Consistent SQLite backup and integrity verifier for an offline Windows Store Hub.
 * Operational rule: restore is a separate supervised process while Store Hub is STOPPED.
 */
import {DatabaseSync} from 'node:sqlite';
import {existsSync,mkdirSync,statSync} from 'node:fs';
import {resolve,dirname} from 'node:path';
const mode=process.argv[2];
const source=resolve(process.env.STORE_DB_PATH||'./store-data/bmc.sqlite');
const destination=resolve(process.argv[3]||'./store-backups/backup-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+Date.now()+'.sqlite');
if(!['backup','verify'].includes(mode)){console.error('Usage: npm run backup:store -- /safe/path/backup.sqlite OR npm run verify:backup -- /safe/path/backup.sqlite');process.exit(2)}
const path=mode==='verify'?destination:source;
if(!existsSync(path))throw Error('SQLite file does not exist: '+path);
if(statSync(path).size<4096)throw Error('Backup/database looks too small: '+path);
const db=new DatabaseSync(path,{readOnly:mode==='verify'});
try{
 const check=db.prepare('PRAGMA integrity_check').all();
 if(check.length!==1||check[0].integrity_check!=='ok')throw Error('SQLite integrity check failed: '+JSON.stringify(check));
 const fk=db.prepare('PRAGMA foreign_key_check').all();
 if(fk.length)throw Error('Foreign key violations: '+fk.length);
 if(mode==='backup'){
  if(existsSync(destination))throw Error('Refusing to overwrite an existing backup file');
  mkdirSync(dirname(destination),{recursive:true});
  // VACUUM INTO uses a consistent point-in-time database snapshot even with WAL.
  db.exec("VACUUM INTO '"+destination.replaceAll("'","''")+"'");
  const verifyDb=new DatabaseSync(destination,{readOnly:true});
  try{
   const v=verifyDb.prepare('PRAGMA integrity_check').get();
   if(v?.integrity_check!=='ok')throw Error('New backup integrity failed');
   const currentOrders=db.prepare('SELECT COUNT(*) n FROM orders').get()?.n;
   const backedOrders=verifyDb.prepare('SELECT COUNT(*) n FROM orders').get()?.n;
   if(currentOrders!==backedOrders)console.warn('Orders changed while backup was being created; snapshot remains consistent as-of-time.');
  }finally{verifyDb.close()}
  console.log('Verified SQLite snapshot created:',destination);
 }else console.log('Verified backup integrity:',destination);
}finally{db.close()}
