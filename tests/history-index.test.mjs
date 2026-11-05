/**
 * LOAD-02 follow-up: compare cursor history before/after additive composite indexes.
 *
 * Two disposable SQLite WAL databases receive identical synthetic rows and
 * trigger-generated outbox events. No shop database, customer data, payments,
 * cloud, printer or bank provider is used.
 *
 * Timings are CI evidence only; Windows cashier UI and LAN acceptance remain
 * separate field gates.
 */
import {test} from 'node:test';
import assert from 'node:assert/strict';
import {createRequire} from 'node:module';
import {mkdirSync,mkdtempSync,rmSync,statSync,writeFileSync} from 'node:fs';
import {tmpdir} from 'node:os';
import {join,resolve} from 'node:path';
import {performance} from 'node:perf_hooks';
import 'reflect-metadata';

const require=createRequire(import.meta.url);
const VOLUME=100_000;
const EXTRA=2_000;
const PAGE_SIZE=100;
const owner={id:'qa_owner',name:'QA',role:'OWNER'};
const staff={id:'qa_staff_a',name:'QA',role:'STAFF'};
const padded=n=>String(n).padStart(6,'0');
const rounded=n=>Math.round(n*100)/100;
const percentile=(sorted,p)=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];
const INDEX_SQL=`
CREATE INDEX IF NOT EXISTS idx_orders_history_cursor
 ON orders(created_at DESC,id DESC);
CREATE INDEX IF NOT EXISTS idx_orders_staff_history_cursor
 ON orders(created_by,created_at DESC,id DESC);
`;

function seed(service,start,count){
 const db=service.store;
 const insert=db.db.prepare(
  'INSERT INTO orders(id,display_code,created_at,created_by,status,payment_status,requested_method,total_vnd,version,note,lines_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
 );
 const epoch=Date.UTC(2026,0,1);
 const started=performance.now();
 db.transaction(()=>{
  for(let i=start;i<start+count;i++){
   // Ten orders share each timestamp so the ID tie-breaker is exercised.
   const timestamp=new Date(epoch+Math.floor(i/10)*60_000).toISOString();
   insert.run(
    'synthetic-order-'+padded(i),'H'+padded(i),timestamp,
    i%2===0?'qa_staff_a':'qa_staff_b',
    'COMMITTED','UNPAID','CASH',35_000,1,'','[]'
   );
  }
 });
 return performance.now()-started;
}
function plan(service,actor,boundaryIndex){
 const timestamp=new Date(Date.UTC(2026,0,1)+Math.floor(boundaryIndex/10)*60_000).toISOString();
 const id='synthetic-order-'+padded(boundaryIndex);
 const staffScope=actor.role==='STAFF';
 const sql='EXPLAIN QUERY PLAN SELECT * FROM orders '+
  (staffScope?'WHERE created_by=? AND ':'WHERE ')+
  '(created_at<? OR (created_at=? AND id<?)) '+
  'ORDER BY created_at DESC,id DESC LIMIT ?';
 const args=staffScope?[actor.id,timestamp,timestamp,id,PAGE_SIZE+1]:[timestamp,timestamp,id,PAGE_SIZE+1];
 return service.store.db.prepare(sql).all(...args).map(row=>row.detail);
}
function measure(service,actor,totalRows){
 const durations=[];
 let cursor;
 let seen=0;
 let pages=0;
 const started=performance.now();
 do{
  const t0=performance.now();
  const result=service.history(actor,cursor,PAGE_SIZE);
  durations.push(performance.now()-t0);
  assert.ok(result.items.length>0&&result.items.length<=PAGE_SIZE);
  for(const row of result.items){
   const expected=actor.role==='STAFF'?totalRows-2-2*seen:totalRows-1-seen;
   assert.equal(row.display_code,'H'+padded(expected),
    'Cursor gap/duplicate/tie-break order mismatch at row '+seen);
   assert.equal(row.payment_status,'UNPAID');
   assert.equal(row.total_vnd,35_000);
   if(actor.role==='STAFF')assert.equal(row.created_by,actor.id);
   seen++;
  }
  cursor=result.next_cursor;
  pages++;
  assert.ok(pages<=Math.ceil(totalRows/PAGE_SIZE),'Cursor must terminate');
 }while(cursor);
 assert.equal(seen,actor.role==='STAFF'?totalRows/2:totalRows);
 const sorted=[...durations].sort((a,b)=>a-b);
 return {
  pages,rows:seen,
  traversalMs:rounded(performance.now()-started),
  perPageMs:{
   p50:rounded(percentile(sorted,.50)),
   p95:rounded(percentile(sorted,.95)),
   p99:rounded(percentile(sorted,.99)),
  },
 };
}
function dbStats(service,path){
 service.store.db.exec('PRAGMA wal_checkpoint(TRUNCATE)');
 const pageCount=service.store.db.prepare('PRAGMA page_count').get().page_count;
 const pageSize=service.store.db.prepare('PRAGMA page_size').get().page_size;
 return {fileBytes:statSync(path).size,pageCount,pageSize,allocatedBytes:pageCount*pageSize};
}

test('LOAD-02 follow-up: composite indexes remove cursor sort while preserving rows and measuring write/storage trade-offs',{
 timeout:300_000,
},()=>{
 const folder=mkdtempSync(join(tmpdir(),'bmc-history-index-'));
 const baselinePath=join(folder,'baseline.sqlite');
 const indexedPath=join(folder,'indexed.sqlite');
 const previousDb=process.env.STORE_DB_PATH;
 const previousMode=process.env.NODE_ENV;
 let baseline;
 let indexed;
 try{
  process.env.NODE_ENV='test';
  const {StoreService}=require('../apps/store-hub/dist/service.js');
  process.env.STORE_DB_PATH=baselinePath;
  baseline=new StoreService();
  process.env.STORE_DB_PATH=indexedPath;
  indexed=new StoreService();

  // Confirm startup migration created both indexes, then drop them for a same-data baseline.
  for(const service of [baseline,indexed]){
   const names=service.store.db.prepare("SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_orders_history_cursor','idx_orders_staff_history_cursor')").all().map(row=>row.name);
   assert.deepEqual(names.sort(),['idx_orders_history_cursor','idx_orders_staff_history_cursor']);
  }
  baseline.store.db.exec('DROP INDEX IF EXISTS idx_orders_history_cursor; DROP INDEX IF EXISTS idx_orders_staff_history_cursor;');
  indexed.store.db.exec('DROP INDEX IF EXISTS idx_orders_history_cursor; DROP INDEX IF EXISTS idx_orders_staff_history_cursor;');
  const baselineSeedMs=seed(baseline,0,VOLUME);
  const indexedSeedMs=seed(indexed,0,VOLUME);
  assert.equal(baseline.store.row('SELECT COUNT(*) n FROM orders').n,VOLUME);
  assert.equal(indexed.store.row('SELECT COUNT(*) n FROM orders').n,VOLUME);
  assert.equal(baseline.store.row("SELECT COUNT(*) n FROM sync_outbox WHERE entity='order'").n,VOLUME);
  assert.equal(indexed.store.row("SELECT COUNT(*) n FROM sync_outbox WHERE entity='order'").n,VOLUME);
  assert.equal(baseline.store.row('SELECT COUNT(*) n FROM payments').n,0);
  assert.equal(indexed.store.row('SELECT COUNT(*) n FROM payments').n,0);

  baseline.store.db.exec('ANALYZE');
  indexed.store.db.exec('ANALYZE');
  const baselineOwnerPlan=plan(baseline,owner,50_000);
  const baselineStaffPlan=plan(baseline,staff,50_000);
  assert.ok(baselineOwnerPlan.some(line=>line.includes('TEMP B-TREE')),
   'Baseline owner cursor query should expose the current tie-break sort');
  const indexBuildStarted=performance.now();
  indexed.store.db.exec(INDEX_SQL);
  const indexBuildMs=rounded(performance.now()-indexBuildStarted);
  indexed.store.db.exec('ANALYZE');

  // Equal-sized, identical post-index insert batches expose write amplification.
  const baselineInsertMs=seed(baseline,VOLUME,EXTRA);
  const indexedInsertMs=seed(indexed,VOLUME,EXTRA);
  const totalRows=VOLUME+EXTRA;
  assert.equal(baseline.store.row('SELECT COUNT(*) n FROM orders').n,totalRows);
  assert.equal(indexed.store.row('SELECT COUNT(*) n FROM orders').n,totalRows);
  assert.equal(baseline.store.row("SELECT COUNT(*) n FROM sync_outbox WHERE entity='order'").n,totalRows);
  assert.equal(indexed.store.row("SELECT COUNT(*) n FROM sync_outbox WHERE entity='order'").n,totalRows);

  baseline.store.db.exec('ANALYZE');
  indexed.store.db.exec('ANALYZE');
  const indexedOwnerPlan=plan(indexed,owner,50_000);
  const indexedStaffPlan=plan(indexed,staff,50_000);
  assert.ok(indexedOwnerPlan.some(line=>line.includes('idx_orders_history_cursor')),
   'Owner cursor must use the composite cursor index');
  assert.ok(indexedStaffPlan.some(line=>line.includes('idx_orders_staff_history_cursor')),
   'Staff cursor must use the staff-scoped composite index');
  assert.ok(!indexedOwnerPlan.some(line=>line.includes('TEMP B-TREE')),
   'Owner cursor must not sort into a temporary B-tree');
  assert.ok(!indexedStaffPlan.some(line=>line.includes('TEMP B-TREE')),
   'Staff cursor must not sort into a temporary B-tree');

  const rssBefore=process.memoryUsage().rss;
  const baselineOwnerAfterInsert=measure(baseline,owner,totalRows);
  const baselineStaffAfterInsert=measure(baseline,staff,totalRows);
  const indexedOwner=measure(indexed,owner,totalRows);
  const indexedStaff=measure(indexed,staff,totalRows);
  const rssAfter=process.memoryUsage().rss;

  const baselineSize=dbStats(baseline,baselinePath);
  const indexedSize=dbStats(indexed,indexedPath);
  const report={
   scenario:'LOAD-02 composite cursor index comparison',
   version:1,
   environment:{node:process.versions.node,platform:process.platform,arch:process.arch,sqlite:baseline.store.db.prepare('SELECT sqlite_version() version').get().version},
   rows:totalRows,
   sharedTimestampGroupSize:10,
   pageSize:PAGE_SIZE,
   seed100kMs:{baseline:rounded(baselineSeedMs),candidate:rounded(indexedSeedMs)},
   indexBuildMs,
   extraInsert2kMs:{withoutIndexes:rounded(baselineInsertMs),withIndexes:rounded(indexedInsertMs)},
   extraInsertOverheadPercent:rounded((indexedInsertMs/baselineInsertMs-1)*100),
   owner:{
    indexedAt102k:indexedOwner,
    baselineAt102k:baselineOwnerAfterInsert,
    queryPlanBefore:baselineOwnerPlan,
    queryPlanAfter:indexedOwnerPlan,
   },
   staff:{
    indexedAt102k:indexedStaff,
    baselineAt102k:baselineStaffAfterInsert,
    queryPlanBefore:baselineStaffPlan,
    queryPlanAfter:indexedStaffPlan,
   },
   storage:{withoutIndexes:baselineSize,withIndexes:indexedSize,addedFileBytes:indexedSize.fileBytes-baselineSize.fileBytes},
   processRss:{beforeIndexedTraversalBytes:rssBefore,afterIndexedTraversalBytes:rssAfter,deltaBytes:rssAfter-rssBefore,
    caveat:'Process RSS is shared-process informational data, not attributable index-only memory.'},
   correctness:{baselineRows:baselineOwnerAfterInsert.rows,indexedRows:indexedOwner.rows,staffRows:indexedStaff.rows,
    baselineOutboxRows:baseline.store.row("SELECT COUNT(*) n FROM sync_outbox WHERE entity='order'").n,
    indexedOutboxRows:indexed.store.row("SELECT COUNT(*) n FROM sync_outbox WHERE entity='order'").n,
    paymentRows:0,duplicateOrMissingRows:0},
   caveat:'Synthetic SQLite WAL and StoreService.history only. Not live HTTP, POS browser, 8 phones, Windows cashier UI, cloud or production data. Timings are CI-comparative only; real Windows p95 <=300ms and LAN p95 <=400ms remain field gates.'
  };
  assert.equal(report.correctness.baselineRows,totalRows);
  assert.equal(report.correctness.indexedRows,totalRows);
  assert.equal(report.correctness.staffRows,totalRows/2);
  const dir=resolve('artifacts/perf');
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'load02-history-index-comparison.json'),JSON.stringify(report,null,2)+'\n');
  console.log('BMC_LOAD02_HISTORY_INDEX '+JSON.stringify(report));
 }finally{
  baseline?.store?.db?.close();
  indexed?.store?.db?.close();
  if(previousDb===undefined)delete process.env.STORE_DB_PATH;
  else process.env.STORE_DB_PATH=previousDb;
  if(previousMode===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=previousMode;
  rmSync(folder,{recursive:true,force:true});
 }
});
