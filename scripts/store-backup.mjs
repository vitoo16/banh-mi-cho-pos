#!/usr/bin/env node
/**
 * Bánh Mì Chợ Hub backup / verified restore-copy.
 * Files remain PLAINTEXT; checksums detect corruption, not adversarial tampering.
 * Never replaces the live SQLite file or an existing restore destination.
 */
import {DatabaseSync} from 'node:sqlite';
import {createReadStream} from 'node:fs';
import {createHash} from 'node:crypto';
import {
 existsSync,mkdirSync,statSync,copyFileSync,rmSync,openSync,closeSync,
 fsyncSync,chmodSync,constants,readFileSync,writeFileSync,
} from 'node:fs';
import {resolve,dirname,basename} from 'node:path';

const mode=process.argv[2];
const live=resolve(process.env.STORE_DB_PATH||'./store-data/bmc.sqlite');
const defaultBackup=resolve('./store-backups/backup-'+new Date().toISOString().slice(0,10).replaceAll('-','')+'-'+Date.now()+'.sqlite');
const first=resolve(process.argv[3]||defaultBackup);
const second=process.argv[4]?resolve(process.argv[4]):null;
const requiredTables=['orders','payments','receipts','sync_outbox','idempotency','audit'];
const countedTables=['orders','payments','receipts','sync_outbox','idempotency','audit','shifts','cash_movements'];
const manifestPath=file=>file+'.manifest.json';
const warning='WARNING: SQLite AND manifest remain PLAINTEXT. Store both in approved encrypted/off-host storage with restricted access. A SHA-256 manifest is NOT a signature.';
if(!['backup','verify','restore-copy'].includes(mode)){
 console.error('Usage: backup <NEW-backup.sqlite> | verify <backup.sqlite> | restore-copy <backup.sqlite> <NEW-sandbox.sqlite>');
 process.exit(2);
}
if(mode==='restore-copy'&&!second)throw Error('restore-copy requires a NEW destination filename');

function inspect(file){
 if(!existsSync(file)||statSync(file).size<4096)throw Error('Missing, corrupt or undersized SQLite file: '+file);
 const db=new DatabaseSync(file,{readOnly:true});
 try{
  const result=db.prepare('PRAGMA integrity_check').all();
  if(result.length!==1||result[0].integrity_check!=='ok')throw Error('SQLite integrity_check failed for '+file);
  if(db.prepare('PRAGMA foreign_key_check').all().length)throw Error('Foreign key violation in '+file);
  for(const table of requiredTables){
   if(!db.prepare('SELECT 1 FROM sqlite_master WHERE type=? AND name=?').get('table',table))
    throw Error('Not a complete Bánh Mì Chợ Store Hub database: missing '+table);
  }
  return {
   schema_user_version:Number(db.prepare('PRAGMA user_version').get().user_version),
   counts:Object.fromEntries(countedTables.map(table=>[
    table,Number(db.prepare('SELECT COUNT(*) n FROM "'+table+'"').get().n),
   ])),
  };
 }finally{db.close()}
}
async function sha256(file){
 const digest=createHash('sha256');
 for await(const chunk of createReadStream(file))digest.update(chunk);
 return digest.digest('hex');
}
function fsyncFile(file){
 const handle=openSync(file,'r');
 try{fsyncSync(handle)}finally{closeSync(handle)}
}
function privateMode(file){
 try{chmodSync(file,0o600)}catch{/* Windows NTFS ACLs must be managed separately */}
}
function writeManifest(file,manifest){
 const path=manifestPath(file);
 let handle;
 try{
  handle=openSync(path,'wx',0o600); // exclusive; never clobber an existing manifest
  writeFileSync(handle,JSON.stringify(manifest,null,2)+'\n');
  fsyncSync(handle);
 }catch(err){
  if(handle!==undefined){closeSync(handle);rmSync(path,{force:true});handle=undefined}
  throw err;
 }finally{if(handle!==undefined)closeSync(handle)}
 privateMode(path);
}
function validateManifest(file,manifest){
 if(!manifest||typeof manifest!=='object'||Array.isArray(manifest))
  throw Error('Invalid backup manifest structure');
 if(manifest.format!=='bmc-sqlite-backup'||manifest.version!==1)
  throw Error('Unsupported backup manifest format/version');
 if(manifest.file_name!==basename(file))
  throw Error('Backup manifest filename mismatch (rename or misplaced sidecar)');
 if(typeof manifest.snapshot_at!=='string'||!Number.isFinite(Date.parse(manifest.snapshot_at)))
  throw Error('Invalid backup manifest snapshot timestamp');
 if(!Number.isSafeInteger(manifest.size_bytes)||manifest.size_bytes<4096)
  throw Error('Invalid backup manifest size');
 if(typeof manifest.sha256!=='string'||!/^[0-9a-f]{64}$/.test(manifest.sha256))
  throw Error('Invalid backup manifest SHA-256');
 if(!Number.isSafeInteger(manifest.schema_user_version)||manifest.schema_user_version<0)
  throw Error('Invalid backup manifest schema version');
 if(!manifest.counts||typeof manifest.counts!=='object'||Array.isArray(manifest.counts))
  throw Error('Invalid backup manifest row counts');
 for(const table of countedTables)
  if(!Number.isSafeInteger(manifest.counts[table])||manifest.counts[table]<0)
   throw Error('Invalid manifest row count: '+table);
}
async function verifySnapshot(file){
 const sidecar=manifestPath(file);
 if(!existsSync(sidecar))throw Error('Missing SHA-256 manifest: '+sidecar+'; do not restore an unverified legacy backup');
 if(statSync(sidecar).size>8192)throw Error('Backup manifest exceeds safety limit');
 let manifest;
 try{manifest=JSON.parse(readFileSync(sidecar,'utf8'))}
 catch{throw Error('Unparseable backup manifest: '+sidecar)}
 validateManifest(file,manifest);
 if(!existsSync(file)||statSync(file).size!==manifest.size_bytes)
  throw Error('Backup size mismatch: '+file);
 if(await sha256(file)!==manifest.sha256)
  throw Error('Backup SHA-256 mismatch: '+file);
 const info=inspect(file);
 if(info.schema_user_version!==manifest.schema_user_version)
  throw Error('Backup schema version mismatch');
 for(const table of countedTables)
  if(info.counts[table]!==manifest.counts[table])
   throw Error('Backup row count mismatch: '+table);
 return manifest;
}
function newManifest(file,info,digest,source){
 return {
  format:'bmc-sqlite-backup',version:1,
  file_name:basename(file),
  snapshot_at:source?.snapshot_at||new Date().toISOString(),
  size_bytes:statSync(file).size,
  sha256:digest,
  schema_user_version:info.schema_user_version,
  counts:info.counts,
  ...(source?{derived_from_backup:source.file_name}:{}),
 };
}
if(mode==='backup'){
 if(!existsSync(live))throw Error('Store Hub SQLite database does not exist: '+live);
 if(live===first||existsSync(first)||existsSync(manifestPath(first)))
  throw Error('Refusing to overwrite live store, an existing backup or its manifest');
 mkdirSync(dirname(first),{recursive:true});
 inspect(live);
 const connection=new DatabaseSync(live);
 try{
  // Produces a standalone, transactional snapshot while WAL may be active.
  connection.exec("VACUUM INTO '"+first.replaceAll("'","''")+"'");
  privateMode(first);
  const info=inspect(first);
  fsyncFile(first); // persist the payload before publishing its checksum metadata
  writeManifest(first,newManifest(first,info,await sha256(first)));
  const checked=await verifySnapshot(first);
  console.log('Verified SQLite backup + manifest:',first,JSON.stringify(checked.counts));
  console.warn(warning);
 }catch(error){
  // Preflight refused existing paths: only our own new files may be cleaned here.
  rmSync(manifestPath(first),{force:true});
  rmSync(first,{force:true});
  throw error;
 }finally{connection.close()}
}else if(mode==='verify'){
 const result=await verifySnapshot(first);
 console.log('SQLite SHA-256 manifest + integrity verified:',first,JSON.stringify(result.counts));
}else{
 if(first===live)throw Error('Do not restore-copy from a live SQLite database');
 if(second===live)throw Error('Refusing to replace active Store Hub database');
 if(first===second||existsSync(second)||existsSync(manifestPath(second)))
  throw Error('Restore COPY destination or its manifest already exists');
 // All checks must pass BEFORE a destination can be created.
 const original=await verifySnapshot(first);
 mkdirSync(dirname(second),{recursive:true});
 try{
  copyFileSync(first,second,constants.COPYFILE_EXCL);
  privateMode(second);
  fsyncFile(second);
  const info=inspect(second);
  if(await sha256(second)!==original.sha256)
   throw Error('Restored backup SHA-256 mismatch');
  writeManifest(second,newManifest(second,info,original.sha256,original));
  const verified=await verifySnapshot(second);
  console.log('Verified RESTORE COPY + manifest:',second,JSON.stringify(verified.counts));
  console.warn('This is NOT an in-place restore. Stop Hub, preserve original -wal/-shm, and reconcile after-snapshot transactions before cutover.');
  console.warn(warning);
 }catch(error){
  rmSync(manifestPath(second),{force:true});
  rmSync(second,{force:true});
  throw error;
 }
}
