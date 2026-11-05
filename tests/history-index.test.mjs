/**
 * LOAD-02: compare no composite index, OWNER/CASHIER-only index, and both
 * OWNER/CASHIER + STAFF indexes on equal synthetic SQLite datasets.
 *
 * No shop database, customer data, payments, cloud, printer or bank provider.
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
const staff={id:'qa_staff_0',name:'QA',role:'STAFF'};
const padded=n=>String(n).padStart(6,'0');
const rounded=n=>Math.round(n*100)/100;
const percentile=(sorted,p)=>sorted[Math.max(0,Math.ceil(sorted.length*p)-1)];
const OWNER_INDEX_SQL=`
CREATE INDEX IF NOT EXISTS idx_orders_history_cursor
 ON orders(created_at DESC,id DESC);
`;
const STAFF_INDEX_SQL=`
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
    'qa_staff_'+(i%8),
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
   const expected=actor.role==='STAFF'?totalRows-8-8*seen:totalRows-1-seen;
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
 assert.equal(seen,actor.role==='STAFF'?totalRows/8:totalRows);
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
function assertNoTempSort(lines,label){
 assert.ok(!lines.some(line=>line.includes('TEMP B-TREE')),
  label+' must not sort into a temporary B-tree');
}

test('LOAD-02: compare cursor-index read gains against write and storage costs',{
 timeout:300_000,
},()=>{
 const folder=mkdtempSync(join(tmpdir(),'bmc-history-index-'));
 const baselinePath=join(folder,'baseline.sqlite');
 const ownerOnlyPath=join(folder,'owner-only.sqlite');
 const bothPath=join(folder,'owner-and-staff.sqlite');
 const previousDb=process.env.STORE_DB_PATH;
 const previousMode=process.env.NODE_ENV;
 let baseline;
 let ownerOnly;
 let both;
 try{
  process.env.NODE_ENV='test';
  const {StoreService}=require('../apps/store-hub/dist/service.js');
  process.env.STORE_DB_PATH=baselinePath;
  baseline=new StoreService();
  process.env.STORE_DB_PATH=ownerOnlyPath;
  ownerOnly=new StoreService();
  process.env.STORE_DB_PATH=bothPath;
  both=new StoreService();

  // Confirm startup migration created both indexes in every fresh database.
  for(const service of [baseline,ownerOnly,both]){
   const names=service.store.db.prepare(
    "SELECT name FROM sqlite_master WHERE type='index' AND name IN ('idx_orders_history_cursor','idx_orders_staff_history_cursor')"
   ).all().map(row=>row.name);
   assert.deepEqual(names.sort(),['idx_orders_history_cursor','idx_orders_staff_history_cursor']);
   service.store.db.exec('DROP INDEX IF EXISTS idx_orders_history_cursor; DROP INDEX IF EXISTS idx_orders_staff_history_cursor;');
  }

  const seed100kMs={
   baseline:rounded(seed(baseline,0,VOLUME)),
   ownerOnly:rounded(seed(ownerOnly,0,VOLUME)),
   ownerAndStaff:rounded(seed(both,0,VOLUME)),
  };
  for(const service of [baseline,ownerOnly,both]){
   assert.equal(service.store.row('SELECT COUNT(*) n FROM orders').n,VOLUME);
   assert.equal(service.store.row("SELECT COUNT(*) n FROM sync_outbox WHERE entity='order'").n,VOLUME);
   assert.equal(service.store.row('SELECT COUNT(*) n FROM payments').n,0);
   service.store.db.exec('ANALYZE');
  }

  const baselineOwnerPlan=plan(baseline,owner,50_000);
  const baselineStaffPlan=plan(baseline,staff,50_000);
  assert.ok(baselineOwnerPlan.some(line=>line.includes('TEMP B-TREE')),
   'Baseline owner cursor query should expose the current tie-break sort');
  assert.ok(baselineStaffPlan.some(line=>line.includes('TEMP B-TREE')),
   'Baseline staff cursor query should expose the current tie-break sort');

  const ownerIndexBuildStarted=performance.now();
  ownerOnly.store.db.exec(OWNER_INDEX_SQL);
  const ownerIndexBuildMs=rounded(performance.now()-ownerIndexBuildStarted);
  ownerOnly.store.db.exec('ANALYZE');

  const bothOwnerIndexBuildStarted=performance.now();
  both.store.db.exec(OWNER_INDEX_SQL);
  const bothOwnerIndexBuildMs=rounded(performance.now()-bothOwnerIndexBuildStarted);
  const staffIndexBuildStarted=performance.now();
  both.store.db.exec(STAFF_INDEX_SQL);
  const staffIndexBuildMs=rounded(performance.now()-staffIndexBuildStarted);
  const bothIndexBuildMs=rounded(bothOwnerIndexBuildMs+staffIndexBuildMs);
  both.store.db.exec('ANALYZE');

  // Equal-sized 2k inserts on the same logical rows expose index write cost.
  const extraInsert2kMs={
   baseline:rounded(seed(baseline,VOLUME,EXTRA)),
   ownerOnly:rounded(seed(ownerOnly,VOLUME,EXTRA)),
   ownerAndStaff:rounded(seed(both,VOLUME,EXTRA)),
  };
  const totalRows=VOLUME+EXTRA;
  for(const service of [baseline,ownerOnly,both]){
   assert.equal(service.store.row('SELECT COUNT(*) n FROM orders').n,totalRows);
   assert.equal(service.store.row("SELECT COUNT(*) n FROM sync_outbox WHERE entity='order'").n,totalRows);
   assert.equal(service.store.row('SELECT COUNT(*) n FROM payments').n,0);
   service.store.db.exec('ANALYZE');
  }

  const ownerOnlyOwnerPlan=plan(ownerOnly,owner,50_000);
  const ownerOnlyStaffPlan=plan(ownerOnly,staff,50_000);
  const bothOwnerPlan=plan(both,owner,50_000);
  const bothStaffPlan=plan(both,staff,50_000);
  assert.ok(ownerOnlyOwnerPlan.some(line=>line.includes('idx_orders_history_cursor')),
   'OWNER/CASHIER query must use the owner cursor index');
  assert.ok(ownerOnlyStaffPlan.some(line=>line.includes('idx_orders_history_cursor')),
   'STAFF query must at least use the owner cursor index when the staff index is absent');
  assert.ok(bothOwnerPlan.some(line=>line.includes('idx_orders_history_cursor')),
   'OWNER/CASHIER query must use the owner cursor index when both are present');
  assert.ok(bothStaffPlan.some(line=>line.includes('idx_orders_staff_history_cursor')),
   'STAFF query must use the staff-scoped composite index when present');
  assertNoTempSort(ownerOnlyOwnerPlan,'Owner-only OWNER query');
  assertNoTempSort(ownerOnlyStaffPlan,'Owner-only STAFF query');
  assertNoTempSort(bothOwnerPlan,'Two-index OWNER query');
  assertNoTempSort(bothStaffPlan,'Two-index STAFF query');

  // Warm each independent database once before collecting comparable page timings.
  for(const [service,actor] of [
   [baseline,owner],[baseline,staff],
   [ownerOnly,owner],[ownerOnly,staff],
   [both,owner],[both,staff],
  ])measure(service,actor,totalRows);

  const rssBefore=process.memoryUsage().rss;
  const baselineOwner=measure(baseline,owner,totalRows);
  const baselineStaff=measure(baseline,staff,totalRows);
  const ownerOnlyOwner=measure(ownerOnly,owner,totalRows);
  const ownerOnlyStaff=measure(ownerOnly,staff,totalRows);
  const bothOwner=measure(both,owner,totalRows);
  const bothStaff=measure(both,staff,totalRows);
  const rssAfter=process.memoryUsage().rss;

  const baselineSize=dbStats(baseline,baselinePath);
  const ownerOnlySize=dbStats(ownerOnly,ownerOnlyPath);
  const bothSize=dbStats(both,bothPath);
  const report={
   scenario:'LOAD-02 three-way composite cursor index comparison',
   version:2,
   environment:{node:process.versions.node,platform:process.platform,arch:process.arch,sqlite:baseline.store.db.prepare('SELECT sqlite_version() version').get().version},
   rows:totalRows,
   sharedTimestampGroupSize:10,
   syntheticStaffActors:8,
   staffActorShare:0.125,
   pageSize:PAGE_SIZE,
   warmupPasses:1,
   seed100kMs,
   indexBuildMs:{ownerOnly:ownerIndexBuildMs,ownerAndStaffOwnerIndex:bothOwnerIndexBuildMs,staffIncremental:staffIndexBuildMs,ownerAndStaffTotal:bothIndexBuildMs},
   extraInsert2kMs,
   writeOverheadPercent:{
    ownerOnly:rounded((extraInsert2kMs.ownerOnly/extraInsert2kMs.baseline-1)*100),
    ownerAndStaff:rounded((extraInsert2kMs.ownerAndStaff/extraInsert2kMs.baseline-1)*100),
    staffIndexIncremental:rounded((extraInsert2kMs.ownerAndStaff/extraInsert2kMs.ownerOnly-1)*100),
   },
   owner:{
    baseline:baselineOwner,
    ownerOnly:ownerOnlyOwner,
    ownerAndStaff:bothOwner,
    queryPlanBefore:baselineOwnerPlan,
    queryPlanOwnerOnly:ownerOnlyOwnerPlan,
    queryPlanOwnerAndStaff:bothOwnerPlan,
   },
   staff:{
    baseline:baselineStaff,
    ownerOnly:ownerOnlyStaff,
    ownerAndStaff:bothStaff,
    queryPlanBefore:baselineStaffPlan,
    queryPlanOwnerOnly:ownerOnlyStaffPlan,
    queryPlanOwnerAndStaff:bothStaffPlan,
   },
   storage:{
    baseline:baselineSize,
    ownerOnly:ownerOnlySize,
    ownerAndStaff:bothSize,
    addedBytesOwnerOnly:ownerOnlySize.fileBytes-baselineSize.fileBytes,
    addedBytesStaffIndex:bothSize.fileBytes-ownerOnlySize.fileBytes,
    addedBytesBoth:bothSize.fileBytes-baselineSize.fileBytes,
   },
   processRss:{
    beforeTraversalBytes:rssBefore,afterTraversalBytes:rssAfter,deltaBytes:rssAfter-rssBefore,
    caveat:'Process RSS is shared-process informational data, not attributable index-only memory.'
   },
   correctness:{
    baselineOwnerRows:baselineOwner.rows,ownerOnlyOwnerRows:ownerOnlyOwner.rows,bothOwnerRows:bothOwner.rows,
    baselineStaffRows:baselineStaff.rows,ownerOnlyStaffRows:ownerOnlyStaff.rows,bothStaffRows:bothStaff.rows,
    baselineOutboxRows:baseline.store.row("SELECT COUNT(*) n FROM sync_outbox WHERE entity='order'").n,
    ownerOnlyOutboxRows:ownerOnly.store.row("SELECT COUNT(*) n FROM sync_outbox WHERE entity='order'").n,
    bothOutboxRows:both.store.row("SELECT COUNT(*) n FROM sync_outbox WHERE entity='order'").n,
    paymentRows:0,duplicateOrMissingRows:0,
   },
   caveat:'Synthetic SQLite WAL and StoreService.history only. Not live HTTP, POS browser, 8 phones, Windows cashier UI, cloud or production data. Timings are CI-comparative only; real Windows p95 <=300ms and LAN p95 <=400ms remain field gates.'
  };
  assert.equal(report.correctness.baselineOwnerRows,totalRows);
  assert.equal(report.correctness.ownerOnlyOwnerRows,totalRows);
  assert.equal(report.correctness.bothOwnerRows,totalRows);
  assert.equal(report.correctness.baselineStaffRows,totalRows/8);
  assert.equal(report.correctness.ownerOnlyStaffRows,totalRows/8);
  assert.equal(report.correctness.bothStaffRows,totalRows/8);
  assert.equal(report.correctness.baselineOutboxRows,totalRows);
  assert.equal(report.correctness.ownerOnlyOutboxRows,totalRows);
  assert.equal(report.correctness.bothOutboxRows,totalRows);
  const dir=resolve('artifacts/perf');
  mkdirSync(dir,{recursive:true});
  writeFileSync(join(dir,'load02-history-index-comparison.json'),JSON.stringify(report,null,2)+'\n');
  console.log('BMC_LOAD02_HISTORY_INDEX '+JSON.stringify(report));
 }finally{
  baseline?.store?.db?.close();
  ownerOnly?.store?.db?.close();
  both?.store?.db?.close();
  if(previousDb===undefined)delete process.env.STORE_DB_PATH;
  else process.env.STORE_DB_PATH=previousDb;
  if(previousMode===undefined)delete process.env.NODE_ENV;
  else process.env.NODE_ENV=previousMode;
  rmSync(folder,{recursive:true,force:true});
 }
});
