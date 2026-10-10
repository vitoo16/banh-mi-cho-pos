#!/usr/bin/env node
import {backup,DatabaseSync} from 'node:sqlite';
import {mkdirSync,existsSync,readFileSync,writeFileSync,renameSync,unlinkSync,statSync} from 'node:fs';
import {createHash} from 'node:crypto';import {join,resolve,dirname} from 'node:path';
const source=resolve(process.env.STORE_DB_PATH||'./store-data/bmc.sqlite');
if(!existsSync(source)||!statSync(source).isFile()){console.error('Store database not found:',source);process.exit(2)}
const dir=resolve(process.env.BMC_BACKUP_DIR||'./backups');mkdirSync(dir,{recursive:true,mode:0o700});
const stamp=new Date().toISOString().replace(/[:.]/g,'-'),dest=join(dir,'bmc-'+stamp+'.sqlite'),tmp=dest+'.partial';
let db;
try{
 db=new DatabaseSync(source,{readOnly:true});await backup(db,tmp);
 const verified=new DatabaseSync(tmp,{readOnly:true});
 try{
  const result=verified.prepare('PRAGMA integrity_check').get();if(result?.integrity_check!=='ok')throw new Error('Backup integrity check failed');
  if(!verified.prepare("SELECT 1 FROM sqlite_master WHERE type='table' AND name='orders'").get())throw new Error('Backup missing orders table');
 }finally{verified.close()}
 const hash=createHash('sha256').update(readFileSync(tmp)).digest('hex');
 renameSync(tmp,dest);
 writeFileSync(dest+'.json',JSON.stringify({name:'BMC-SQLITE-BACKUP',created_at:new Date().toISOString(),sha256:hash,bytes:statSync(dest).size,filename:dest.split('/').pop()},null,2)+'\n',{mode:0o600,flag:'wx'});
 console.log(JSON.stringify({backup:dest,sha256:hash,integrity:'ok'}));
}catch(e){if(existsSync(tmp))unlinkSync(tmp);console.error(e);process.exitCode=1}finally{db?.close()}
