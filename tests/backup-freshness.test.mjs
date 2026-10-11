import {test} from 'node:test';
import assert from 'node:assert/strict';
import {mkdtempSync,rmSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join} from 'node:path';
import {assessBackupDirectory} from '../scripts/check-backup-freshness.mjs';

function fixture(fn){
 const folder=mkdtempSync(join(tmpdir(),'bmc-backup-audit-'));
 try{return fn(folder)}finally{rmSync(folder,{recursive:true,force:true})}
}
const now=Date.parse('2026-10-12T10:00:00.000Z');
function pair(dir,name,at){
 writeFileSync(join(dir,name),'fixture bytes (verification is dependency-injected in this unit test)');
 writeFileSync(join(dir,name+'.manifest.json'),JSON.stringify({snapshot_at:new Date(at).toISOString()}));
}
test('verified recent backup pair passes and exposes age, not money or credentials',()=>fixture(dir=>{
 pair(dir,'backup-1.sqlite',now-4*60000);
 const report=assessBackupDirectory(dir,15,now,()=>{});
 assert.equal(report.ok,true);
 assert.equal(report.examined,1);
 assert.equal(report.verified,1);
 assert.equal(report.newestAgeMinutes,4);
 assert.deepEqual(report.failures,[]);
}));
test('older archives are allowed if newest VERIFIED snapshot meets operator target',()=>fixture(dir=>{
 pair(dir,'old.sqlite',now-300*60000);
 pair(dir,'new.sqlite',now-3*60000);
 const report=assessBackupDirectory(dir,15,now,()=>{});
 assert.equal(report.ok,true);
 assert.equal(report.verified,2);
 assert.equal(report.newestFile,'new.sqlite');
}));
test('stale snapshot and future-dated manifest fail closed',()=>fixture(dir=>{
 pair(dir,'old.sqlite',now-31*60000);
 assert.match(assessBackupDirectory(dir,15,now,()=>{}).failures.join(' '),/stale/i);
 pair(dir,'future.sqlite',now+5*60000);
 const result=assessBackupDirectory(dir,15,now,()=>{});
 assert.equal(result.ok,false);
 assert.match(result.failures.join(' '),/future/i);
}));
test('one corrupt/invalid backup fails audit even alongside a recent valid pair',()=>fixture(dir=>{
 pair(dir,'valid.sqlite',now-2*60000);
 pair(dir,'bad.sqlite',now-1*60000);
 const report=assessBackupDirectory(dir,15,now,file=>{
  if(file.endsWith('bad.sqlite'))throw Error('sha mismatch');
 });
 assert.equal(report.ok,false);
 assert.equal(report.verified,1);
 assert.match(report.failures.join(' '),/sha mismatch/i);
}));
test('missing pair and orphan manifest fail inventory',()=>fixture(dir=>{
 assert.equal(assessBackupDirectory(dir,15,now,()=>{}).ok,false);
 writeFileSync(join(dir,'orphan.sqlite.manifest.json'),'{}');
 pair(dir,'healthy.sqlite',now-2*60000);
 const report=assessBackupDirectory(dir,15,now,()=>{});
 assert.equal(report.ok,false);
 assert.match(report.failures.join(' '),/orphan/i);
 writeFileSync(join(dir,'missing.sqlite'),'orphan DB');
 assert.match(assessBackupDirectory(dir,15,now,()=>{}).failures.join(' '),/Missing manifest/i);
}));
test('invalid max age cannot silently disable RPO warning',()=>fixture(dir=>{
 for(const age of [0,-1,1.5,Infinity,10081,NaN])
  assert.throws(()=>assessBackupDirectory(dir,age,now,()=>{}),/Max age/);
}));
