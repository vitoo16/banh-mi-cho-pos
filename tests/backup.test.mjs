import {test} from 'node:test';import assert from 'node:assert/strict';
import {mkdtempSync,mkdirSync,rmSync,readdirSync,appendFileSync} from 'node:fs';
import {tmpdir} from 'node:os';import {join} from 'node:path';import {execFileSync} from 'node:child_process';
import {DatabaseSync} from 'node:sqlite';
test('SQLite online backup, checksum, integrity and disposable restore',()=>{
 const root=mkdtempSync(join(tmpdir(),'bmc-backup-ci-')),dbPath=join(root,'store.sqlite'),dest=join(root,'bak');mkdirSync(dest);
 try{
  const db=new DatabaseSync(dbPath);
  db.exec("CREATE TABLE orders(id TEXT PRIMARY KEY); CREATE TABLE users(id TEXT PRIMARY KEY); CREATE TABLE payments(id TEXT PRIMARY KEY); CREATE TABLE cash_movements(id TEXT PRIMARY KEY); CREATE TABLE idempotency(key TEXT PRIMARY KEY); INSERT INTO orders(id) VALUES ('order-001')");
  db.close();
  execFileSync(process.execPath,['scripts/backup-store.mjs'],{env:{...process.env,STORE_DB_PATH:dbPath,BMC_BACKUP_DIR:dest},encoding:'utf8'});
  const backup=readdirSync(dest).find(x=>x.endsWith('.sqlite'));assert.ok(backup);
  const filepath=join(dest,backup);
  const output=execFileSync(process.execPath,['scripts/verify-restore.mjs',filepath],{encoding:'utf8'});
  assert.match(output,/"valid":true/);assert.match(output,/"orders":1/);
  appendFileSync(filepath,Buffer.from('tamper'));
  assert.throws(()=>execFileSync(process.execPath,['scripts/verify-restore.mjs',filepath],{stdio:'pipe'}));
 }finally{rmSync(root,{recursive:true,force:true})}
});
