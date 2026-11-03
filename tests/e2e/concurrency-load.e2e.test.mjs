/**
 * Real Process Concurrency and Burst Load Test for Bánh Mì Chợ POS.
 * Spawns an isolated Store Hub instance on loopback and fires 150 orders across 8 distinct staff sessions.
 * Asserts 0 dropped orders, 0 duplicated display codes, Hub-computed integer totals, and measures p50/p95/p99.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const PORT = 4421;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OWNER_PIN = 'e2e-burst-owner-pin-9999';
const CASHIER_PIN = 'e2e-burst-cashier-pin-8888';
const STAFF_PIN = 'e2e-burst-staff-pin-7777';
const EXTRA_STAFF_PIN = 'e2e-burst-extra-staff-6666';

let hubProcess;
let tempDir;

async function request(method, path, token, body, key) {
  const headers = {
    'Accept': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(key ? { 'Idempotency-Key': key } : {})
  };
  const response = await fetch(BASE_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(15000)
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, body: data };
}

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'bmc-e2e-burst-'));
  const dbPath = join(tempDir, 'hub-burst.sqlite');

  const env = {
    ...process.env,
    STORE_DB_PATH: dbPath,
    HUB_BIND_HOST: '127.0.0.1',
    HUB_PORT: String(PORT),
    SEED_DEMO_CATALOG: '1',
    BOOTSTRAP_OWNER_PIN: OWNER_PIN,
    BOOTSTRAP_CASHIER_PIN: CASHIER_PIN,
    BOOTSTRAP_STAFF_PIN: STAFF_PIN
  };

  hubProcess = spawn(process.execPath, [resolve('apps/store-hub/dist/main.js')], {
    env,
    stdio: ['ignore', 'pipe', 'pipe']
  });

  let ready = false;
  hubProcess.stdout.on('data', d => {
    if (d.toString().includes('BMC PILOT HUB')) ready = true;
  });
  hubProcess.stderr.on('data', d => console.error('[HUB ERR]', d.toString()));

  for (let i = 0; i < 60; i++) {
    if (ready) break;
    await new Promise(r => setTimeout(r, 100));
  }
  assert.ok(ready, 'Store Hub must boot on loopback for concurrency test');
});

after(async () => {
  if (hubProcess) {
    hubProcess.kill();
    await new Promise(r => setTimeout(r, 500));
  }
  if (tempDir && existsSync(tempDir)) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {}
  }
});

test('LOAD-01: 8 concurrent staff sessions create 150 orders burst without duplicates or errors', async () => {
  // 1. Owner logs in and provisions 7 additional staff accounts
  const ownerRes = await request('POST', '/v1/auth/login', null, { user_id: 'owner', pin: OWNER_PIN });
  assert.equal(ownerRes.status, 201);
  const ownerToken = ownerRes.body.token;

  const staffTokens = [];
  // Main bootstrap staff
  const staff0 = await request('POST', '/v1/auth/login', null, { user_id: 'staff', pin: STAFF_PIN });
  staffTokens.push(staff0.body.token);

  for (let i = 1; i <= 7; i++) {
    const id = `qa_burst_staff_${i}`;
    await request('POST', '/v1/owner/employees', ownerToken, {
      id,
      name: `Burst Staff ${i}`,
      role: 'STAFF',
      pin: EXTRA_STAFF_PIN
    }, `burst-emp-${i}`);
    const loginRes = await request('POST', '/v1/auth/login', null, { user_id: id, pin: EXTRA_STAFF_PIN });
    assert.equal(loginRes.status, 201);
    staffTokens.push(loginRes.body.token);
  }
  assert.equal(staffTokens.length, 8);

  // 2. Fetch catalog
  const cat = await request('GET', '/v1/catalog', staffTokens[0]);
  assert.equal(cat.status, 200);
  const p = cat.body.products.find(x => x.id === 'bm-thit') || cat.body.products[0];

  // 3. Fire 150 orders concurrently across 8 staff clients with jitter
  const TOTAL_ORDERS = 150;
  const latencies = [];
  const startAll = performance.now();

  const promises = [];
  for (let i = 0; i < TOTAL_ORDERS; i++) {
    const clientIdx = i % 8;
    const token = staffTokens[clientIdx];
    const key = `burst-order-key-${String(i).padStart(5, '0')}`;
    const qty = 1 + (i % 3);

    const task = (async () => {
      // Small random jitter up to 15ms
      await new Promise(r => setTimeout(r, Math.random() * 15));
      const t0 = performance.now();
      const res = await request('POST', '/v1/orders', token, {
        catalog_version: cat.body.version,
        requested_payment_method: i % 3 === 0 ? 'BANK' : 'CASH',
        items: [{ product_id: p.id, qty, note: `Burst order ${i}` }]
      }, key);
      const elapsed = performance.now() - t0;
      latencies.push(elapsed);
      return res;
    })();
    promises.push(task);
  }

  const results = await Promise.all(promises);
  const totalElapsed = performance.now() - startAll;

  // 4. Assert all succeeded with 201
  assert.equal(results.length, TOTAL_ORDERS);
  for (const r of results) {
    assert.equal(r.status, 201, `Order failed: ${JSON.stringify(r.body)}`);
  }

  // 5. Invariant check: display codes & order_ids are strictly unique
  const orderIds = results.map(r => r.body.order_id);
  const displayCodes = results.map(r => r.body.display_code);
  assert.equal(new Set(orderIds).size, TOTAL_ORDERS, 'All order IDs must be unique');
  assert.equal(new Set(displayCodes).size, TOTAL_ORDERS, 'All display codes must be unique');

  // 6. Invariant check: backend-price authority, integer VND, no false settlement.
  for (const [i, r] of results.entries()) {
    assert.equal(r.body.payment_status, 'UNPAID');
    assert.equal(r.body.status, 'COMMITTED');
    assert.ok(Number.isSafeInteger(r.body.total_vnd), 'All money must be integer VND');
    assert.equal(r.body.total_vnd, p.price_vnd * (1 + (i % 3)),
      'Hub must compute exact total from current catalog snapshot');
  }

  // 7. Calculate and report latencies
  latencies.sort((a, b) => a - b);
  const p50 = latencies[Math.floor(latencies.length * 0.5)];
  const p95 = latencies[Math.floor(latencies.length * 0.95)];
  const p99 = latencies[Math.floor(latencies.length * 0.99)];
  const throughput = Math.round((TOTAL_ORDERS / (totalElapsed / 1000)) * 100) / 100;

  console.log(`[BURST LOAD RESULT] 150 orders across 8 clients:`);
  console.log(`  Throughput: ${throughput} orders/sec (Elapsed: ${totalElapsed.toFixed(2)}ms)`);
  console.log(`  Latencies: p50 = ${p50.toFixed(2)}ms, p95 = ${p95.toFixed(2)}ms, p99 = ${p99.toFixed(2)}ms`);

  // Loopback burst metrics are informational. Real LAN SLO must be measured on
  // the shop's Windows/phone network before commercial sign-off.
  console.log(`  Informational loopback comparison: p95 ${p95.toFixed(2)}ms vs field LAN target 400ms (NOT a real LAN acceptance result).`);
});

