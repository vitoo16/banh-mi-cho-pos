import {test} from 'node:test';
import assert from 'node:assert/strict';
import {salesWindow,todayInVietnam} from '../packages/contracts/dist/index.js';

test('Shop-local day, Monday week, month, quarter and year are UTC half-open windows',()=>{
 const date='2026-10-11';
 assert.deepEqual([salesWindow('day',date).start_utc,salesWindow('day',date).end_utc],
  ['2026-10-10T17:00:00.000Z','2026-10-11T17:00:00.000Z']);
 assert.deepEqual([salesWindow('week',date).start_utc,salesWindow('week',date).end_utc],
  ['2026-10-04T17:00:00.000Z','2026-10-11T17:00:00.000Z']);
 assert.deepEqual([salesWindow('month',date).start_utc,salesWindow('month',date).end_utc],
  ['2026-09-30T17:00:00.000Z','2026-10-31T17:00:00.000Z']);
 assert.deepEqual([salesWindow('quarter',date).start_utc,salesWindow('quarter',date).end_utc],
  ['2026-09-30T17:00:00.000Z','2026-12-31T17:00:00.000Z']);
 assert.deepEqual([salesWindow('year',date).start_utc,salesWindow('year',date).end_utc],
  ['2025-12-31T17:00:00.000Z','2026-12-31T17:00:00.000Z']);
 assert.equal(salesWindow('month','2024-02-29').end_utc,'2024-02-29T17:00:00.000Z');
 assert.equal(todayInVietnam(Date.parse('2026-10-10T18:01:00Z')),'2026-10-11');
 for(const bad of ['2026-02-29','2026-13-01','2026-00-10','not-a-date','0000-01-01','2026-10-1']){
  assert.throws(()=>salesWindow('day',bad),/INVALID_DATE/,bad);
 }
 assert.throws(()=>salesWindow('fiscal','2026-10-11'),/INVALID_PERIOD/);
});
