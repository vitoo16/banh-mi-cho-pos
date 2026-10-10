#!/usr/bin/env node
import {DatabaseSync} from 'node:sqlite';import {readFileSync,existsSync,copyFileSync,mkdtempSync,rmSync} from 'node:fs';import {createHash} from 'node:crypto';import {join,resolve} from 'node:path';import {tmpdir} from 'node:os';
const file=process.argv[2];if(!file){console.error('Usage: node scripts/verify-restore.mjs /path/to/backup.sqlite');process.exit(2)}
const backup=resolve(file),manifestPath=backup+'.json';
if(!existsSync(backup)||!existsSync(manifestPath))throw Error('Missing backup or manifest');
const meta=JSON.parse(readFileSync(manifestPath,'utf8'));
const hash=createHash('sha256').update(readFileSync(backup)).digest('hex');
if(meta.sha256!==hash)throw Error('Backup checksum mismatch; DO NOT restore');
const tmp=mkdtempSync(join(tmpdir(),'bmc-restore-check-'));let db;
try{
 const safe=join(tmp,'restore.sqlite');copyFileSync(backup,safe);db=new DatabaseSync(safe,{readOnly:true});
 const integrity=db.prepare('PRAGMA integrity_check').get();
 if(integrity?.integrity_check!=='ok')throw Error('Integrity check failed');
 for(const table of ['orders','payments','cash_movements','idempotency','users']){
  if(!db.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name=?").get(table))throw Error('Missing '+table);
 }
 const count=db.prepare('SELECT COUNT(*) n FROM orders').get()?.n||0;
 console.log(JSON.stringify({valid:true,sha256:hash,orders:count,restore_copy:safe}));
}finally{db?.close();rmSync(tmp,{recursive:true,force:true})}
