/**
 * LOAD-02 — 100,000-row SQLite cursor benchmark.
 *
 * Synthetic isolated data, no customer records, no remote host, no merchant
 * integrations and no direct production schema mutations. The Hub's real
 * history() implementation and SQLite WAL schema/indexes are exercised.
 *
 * CI timings are informational; the 50ms SQL / 300ms POS UI acceptance targets
 * must still be tested on the actual Windows cashier hardware.
 */
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createRequire } from 'node:module';
import { mkdtempSync, mkdirSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { performance } from 'node:perf_hooks';
import 'reflect-metadata';

const require = createRequire(import.meta.url);
const VOLUME = 100_000;
const PAGE_SIZE = 100;
const owner = { id: 'qa_owner', name: 'QA', role: 'OWNER' };
const staff = { id: 'qa_staff_a', name: 'QA', role: 'STAFF' };
const padded = n => String(n).padStart(6, '0');
const percentile = (sorted, fraction) => sorted[Math.max(0, Math.ceil(sorted.length * fraction) - 1)];
const rounded = value => Math.round(value * 100) / 100;

test('LOAD-02: 100k synthetic orders traverse indexed cursor without gaps, duplication or unsafe role scope', {
  timeout: 240_000
}, () => {
  const folder = mkdtempSync(join(tmpdir(), 'bmc-load02-disposable-'));
  const previousDb = process.env.STORE_DB_PATH;
  const previousMode = process.env.NODE_ENV;
  let service;
  try {
    // Do not inspect or write the invoking host's configured shop DB.
    process.env.STORE_DB_PATH = join(folder, 'qa-history.sqlite');
    process.env.NODE_ENV = 'test';
    const { StoreService } = require('../apps/store-hub/dist/service.js');
    service = new StoreService();
    const db = service.store;
    assert.equal(db.row('PRAGMA journal_mode').journal_mode, 'wal');

    // Use the actual installed schema and triggers, but seed directly to avoid
    // the unrelated auth/API expense of 100k sequential order POST requests.
    // All synthetic orders are UNPAID: no fictional revenue is created.
    const insert = db.db.prepare(
      'INSERT INTO orders(id,display_code,created_at,created_by,status,payment_status,requested_method,total_vnd,version,note,lines_json) VALUES(?,?,?,?,?,?,?,?,?,?,?)'
    );
    const started = performance.now();
    const epoch = Date.UTC(2026, 0, 1);
    db.transaction(() => {
      for (let i = 0; i < VOLUME; i++) {
        const id = 'synthetic-order-' + padded(i);
        const timestamp = new Date(epoch + i * 60_000).toISOString();
        insert.run(id, 'H' + padded(i), timestamp,
          i % 2 === 0 ? 'qa_staff_a' : 'qa_staff_b',
          'COMMITTED', 'UNPAID', 'CASH', 35_000, 1, '', '[]');
      }
    });
    const seedMs = performance.now() - started;
    assert.equal(db.row('SELECT COUNT(*) AS n FROM orders').n, VOLUME);
    assert.equal(db.row('SELECT COUNT(*) AS n FROM payments').n, 0);
    assert.equal(db.row('SELECT COUNT(*) AS n FROM sync_outbox WHERE entity=?', 'order').n, VOLUME,
      'Actual SQLite trigger must capture each synthetic order');

    const explain = db.all(
      'EXPLAIN QUERY PLAN SELECT * FROM orders WHERE (created_at<? OR (created_at=? AND id<?)) ORDER BY created_at DESC,id DESC LIMIT ?',
      new Date(epoch + 50_000 * 60_000).toISOString(),
      new Date(epoch + 50_000 * 60_000).toISOString(),
      'synthetic-order-' + padded(50_000), 101
    ).map(row => row.detail);
    assert.ok(explain.length > 0, 'SQLite query plan must be captured');

    const durations = [];
    let seen = 0;
    let cursor;
    let pages = 0;
    const traversalStarted = performance.now();
    do {
      const t0 = performance.now();
      const result = service.history(owner, cursor, PAGE_SIZE);
      durations.push(performance.now() - t0);
      assert.ok(result.items.length > 0 && result.items.length <= PAGE_SIZE);
      for (const row of result.items) {
        const expected = VOLUME - 1 - seen;
        assert.equal(row.display_code, 'H' + padded(expected),
          'Cursor gap/duplicate/out-of-order row at global index ' + seen);
        assert.equal(row.total_vnd, 35_000);
        assert.equal(row.payment_status, 'UNPAID');
        assert.equal(row.requested_payment_method, 'CASH');
        seen++;
      }
      cursor = result.next_cursor;
      pages++;
      assert.ok(pages <= Math.ceil(VOLUME / PAGE_SIZE), 'Cursor must terminate');
    } while (cursor);
    const traversalMs = performance.now() - traversalStarted;
    assert.equal(seen, VOLUME);
    assert.equal(pages, VOLUME / PAGE_SIZE);

    // Authorization-aware server method must scope STAFF to their own records.
    const staffPage = service.history(staff, undefined, PAGE_SIZE);
    assert.equal(staffPage.items.length, PAGE_SIZE);
    assert.ok(staffPage.items.every(row => row.created_by === staff.id));
    assert.equal(db.row('SELECT COUNT(*) AS n FROM orders WHERE created_by=?', staff.id).n, 50_000);

    // Test corrupted and excessively long cursors fail closed.
    assert.throws(() => service.history(owner, 'invalid-base64-string'), err => err?.code === 'INVALID_CURSOR');
    assert.throws(() => service.history(owner, 'a'.repeat(501)), err => err?.code === 'INVALID_CURSOR');

    const sorted = durations.sort((a, b) => a - b);
    const report = {
      scenario: 'LOAD-02',
      version: 1,
      type: 'isolated SQL and StoreService.history benchmark; no HTTP/browser/mobile',
      environment: { node: process.versions.node, platform: process.platform, arch: process.arch },
      syntheticOrders: VOLUME,
      pageSize: PAGE_SIZE,
      cursorPages: pages,
      dataSeedMs: rounded(seedMs),
      cursorTraversalMs: rounded(traversalMs),
      perPageLatencyMs: {
        p50: rounded(percentile(sorted, .50)),
        p95: rounded(percentile(sorted, .95)),
        p99: rounded(percentile(sorted, .99))
      },
      queryPlan: explain,
      sqliteOrderRows: seen,
      sqliteOutboxRows: VOLUME,
      authorizationScope: 'STAFF reads only own records',
      passedCorrectness: true,
      caveat: 'CI numbers are informational. Not 100k live API requests, 100k paid sales, real cashier UI search p95, Windows POS, LAN or cloud integration.'
    };
    const dir = resolve('artifacts/perf');
    mkdirSync(dir, {recursive: true});
    writeFileSync(join(dir, 'load02-history-100k.json'), JSON.stringify(report, null, 2) + '\n');
    console.log('BMC_LOAD02_HISTORY_100K ' + JSON.stringify(report));
  } finally {
    service?.store?.db?.close();
    if (previousDb === undefined) delete process.env.STORE_DB_PATH;
    else process.env.STORE_DB_PATH = previousDb;
    if (previousMode === undefined) delete process.env.NODE_ENV;
    else process.env.NODE_ENV = previousMode;
    rmSync(folder, {recursive: true, force: true});
  }
});
