/**
 * End-to-End Real Process API Acceptance Suite for Bánh Mì Chợ POS.
 * Executes against an actual Store Hub Fastify OS process over loopback HTTP.
 * Strictly uses isolated disposable SQLite WAL database.
 */
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync, existsSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { createHmac } from 'node:crypto';

const PORT = 4420;
const BASE_URL = `http://127.0.0.1:${PORT}`;
const OWNER_PIN = 'e2e-owner-secure-pin-9999';
const CASHIER_PIN = 'e2e-cashier-secure-pin-8888';
const STAFF_PIN = 'e2e-staff-secure-pin-7777';
const EXTRA_STAFF_PIN = 'e2e-extra-staff-pin-6666';
const BANK_SECRET = 'e2e-bank-bridge-secret-32-chars-long';
const BANK_CODE = 'MBBANK';
const BANK_ACCOUNT_NUMBER = '0987654321';

let hubProcess;
let tempDir;
let dbPath;

async function request(method, path, token, body, key, extraHeaders = {}) {
  const headers = {
    'Accept': 'application/json',
    ...(token ? { 'Authorization': `Bearer ${token}` } : {}),
    ...(body ? { 'Content-Type': 'application/json' } : {}),
    ...(key ? { 'Idempotency-Key': key } : {}),
    ...extraHeaders
  };
  const response = await fetch(BASE_URL + path, {
    method,
    headers,
    body: body ? JSON.stringify(body) : undefined,
    signal: AbortSignal.timeout(10000)
  });
  const data = await response.json().catch(() => ({}));
  return { status: response.status, ok: response.ok, body: data };
}

async function login(user_id, pin, pairing_code, device_token) {
  const headers = device_token ? { 'x-device-token': device_token } : {};
  const res = await request('POST', '/v1/auth/login', null, { user_id, pin, pairing_code }, null, headers);
  if (!res.ok) throw new Error(`Login failed for ${user_id}: ${res.status} ${JSON.stringify(res.body)}`);
  return res.body; // { token, user, device_token }
}

before(async () => {
  tempDir = mkdtempSync(join(tmpdir(), 'bmc-e2e-api-'));
  dbPath = join(tempDir, 'hub-e2e.sqlite');

  const env = {
    ...process.env,
    STORE_DB_PATH: dbPath,
    HUB_BIND_HOST: '127.0.0.1',
    HUB_PORT: String(PORT),
    SEED_DEMO_CATALOG: '1',
    BOOTSTRAP_OWNER_PIN: OWNER_PIN,
    BOOTSTRAP_CASHIER_PIN: CASHIER_PIN,
    BOOTSTRAP_STAFF_PIN: STAFF_PIN,
    BANK_BRIDGE_SECRET: BANK_SECRET,
    BANK_CODE: BANK_CODE,
    BANK_ACCOUNT_NUMBER: BANK_ACCOUNT_NUMBER
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
  assert.ok(ready, 'Store Hub must boot successfully on loopback');
});

after(async () => {
  if (hubProcess) {
    hubProcess.kill();
    await new Promise(r => setTimeout(r, 500));
  }
  if (tempDir && existsSync(tempDir)) {
    try {
      rmSync(tempDir, { recursive: true, force: true });
    } catch {
      // ignore Windows handle delay on teardown
    }
  }
});

test('ENV-01 & ENV-02: Store Hub health and initial isolated state', async () => {
  const health = await request('GET', '/v1/health');
  assert.equal(health.status, 200);
  assert.equal(health.body.status, 'ok');
  assert.equal(health.body.mode, 'PILOT_LOCAL');
});

test('AUTH-01: OWNER, CASHIER, STAFF login, logout, and rate limiting', async () => {
  // Valid logins
  const ownerSession = await login('owner', OWNER_PIN);
  assert.equal(ownerSession.user.role, 'OWNER');
  const cashierSession = await login('cashier', CASHIER_PIN);
  assert.equal(cashierSession.user.role, 'CASHIER');
  const staffSession = await login('staff', STAFF_PIN);
  assert.equal(staffSession.user.role, 'STAFF');

  // Rate limiting on 5 wrong PIN attempts
  for (let i = 0; i < 5; i++) {
    const wrong = await request('POST', '/v1/auth/login', null, { user_id: 'staff', pin: 'wrong-pin-0000' });
    assert.equal(wrong.status, 401);
    assert.equal(wrong.body.code, 'AUTH_FAILED');
  }
  const blocked = await request('POST', '/v1/auth/login', null, { user_id: 'staff', pin: STAFF_PIN });
  assert.equal(blocked.status, 429);
  assert.equal(blocked.body.code, 'TOO_MANY_ATTEMPTS');

  // Logout invalidates session
  const logoutRes = await request('POST', '/v1/auth/logout', cashierSession.token);
  assert.equal(logoutRes.status, 201);
  assert.equal(logoutRes.body.ok, true);
  const retest = await request('GET', '/v1/cash-shifts/current', cashierSession.token);
  assert.equal(retest.status, 401);
  assert.equal(retest.body.code, 'SESSION_EXPIRED');
});

test('AUTH-02: Staff role barriers enforced at backend', async () => {
  const ownerSession = await login('owner', OWNER_PIN);
  await request('POST', '/v1/owner/employees', ownerSession.token, {
    id: 'staff_barrier_test',
    name: 'Barrier Staff',
    role: 'STAFF',
    pin: EXTRA_STAFF_PIN
  }, 'e2e-create-barrier-staff-001');

  const s = await login('staff_barrier_test', EXTRA_STAFF_PIN);

  // Staff cannot access Owner finance or dashboard
  const dash = await request('GET', '/v1/owner/dashboard', s.token);
  assert.equal(dash.status, 403);
  assert.equal(dash.body.code, 'FORBIDDEN');

  // Staff cannot access Cashier shifts
  const shift = await request('GET', '/v1/cash-shifts/current', s.token);
  assert.equal(shift.status, 403);
  assert.equal(shift.body.code, 'FORBIDDEN');

  // Staff cannot create cash capture
  const pay = await request('POST', '/v1/orders/any-id/payments/cash', s.token, {
    shift_id: 'shift-1', cash_tendered_vnd: 50000, expected_order_version: 1
  }, 'e2e-staff-illegal-pay-001');
  assert.equal(pay.status, 403);
  assert.equal(pay.body.code, 'FORBIDDEN');
});

test('AUTH-03: Disabling an employee immediately invalidates their active session', async () => {
  const ownerSession = await login('owner', OWNER_PIN);
  await request('POST', '/v1/owner/employees', ownerSession.token, {
    id: 'staff_temp_revoke',
    name: 'Revoke Target',
    role: 'STAFF',
    pin: EXTRA_STAFF_PIN
  }, 'e2e-create-revoke-target-001');

  const staffSession = await login('staff_temp_revoke', EXTRA_STAFF_PIN);
  const cat = await request('GET', '/v1/catalog', staffSession.token);
  assert.equal(cat.status, 200);

  // Owner disables the staff member
  const disableRes = await request('PATCH', '/v1/owner/employees/staff_temp_revoke', ownerSession.token, {
    active: false
  }, 'e2e-disable-staff-001');
  assert.equal(disableRes.status, 200);
  assert.equal(disableRes.body.active, false);

  // Session must now be rejected
  const callAfterDisable = await request('GET', '/v1/catalog', staffSession.token);
  assert.equal(callAfterDisable.status, 401);
  assert.equal(callAfterDisable.body.code, 'SESSION_EXPIRED');

  // New login must also be rejected
  const relogin = await request('POST', '/v1/auth/login', null, { user_id: 'staff_temp_revoke', pin: EXTRA_STAFF_PIN });
  assert.equal(relogin.status, 401);
  assert.equal(relogin.body.code, 'AUTH_FAILED');
});

test('CAT-01 & CAT-02: Catalog version, updates, and stale catalog rejection', async () => {
  const ownerSession = await login('owner', OWNER_PIN);
  const cashierSession = await login('cashier', CASHIER_PIN);

  const initialCat = await request('GET', '/v1/catalog', cashierSession.token);
  assert.equal(initialCat.status, 200);
  const initialVersion = initialCat.body.version;
  const p1 = initialCat.body.products.find(p => p.id === 'bm-thit');
  assert.ok(p1);

  // Owner updates price
  const updateRes = await request('PATCH', `/v1/owner/products/${p1.id}`, ownerSession.token, {
    name: 'Bánh mì thịt đặc biệt',
    price_vnd: 38000,
    is_active: true
  }, 'e2e-update-price-001');
  assert.equal(updateRes.status, 200);
  assert.equal(updateRes.body.price_vnd, 38000);

  // New catalog version incremented
  const updatedCat = await request('GET', '/v1/catalog', cashierSession.token);
  assert.equal(updatedCat.body.version, initialVersion + 1);

  // Order with stale version rejected with 409 CATALOG_CHANGED
  const staleOrder = await request('POST', '/v1/orders', cashierSession.token, {
    catalog_version: initialVersion, // Stale!
    requested_payment_method: 'CASH',
    items: [{ product_id: p1.id, qty: 1 }]
  }, 'e2e-stale-order-001');
  assert.equal(staleOrder.status, 409);
  assert.equal(staleOrder.body.code, 'CATALOG_CHANGED');
});

test('ORDER-01..ORDER-04: Order creation, Unicode notes, idempotency, and invalid inputs', async () => {
  const cashierSession = await login('cashier', CASHIER_PIN);
  const cat = await request('GET', '/v1/catalog', cashierSession.token);
  const p = cat.body.products.find(x => x.id === 'bm-thit');

  // ORDER-01: Valid creation with Vietnamese diacritics
  const orderBody = {
    catalog_version: cat.body.version,
    requested_payment_method: 'CASH',
    items: [{ product_id: p.id, qty: 2, note: '1 ổ không hành, nhiều ớt — Unicode QA' }],
    note: 'Đơn mang đi cho khách quen'
  };
  const key = 'e2e-order-idem-001';
  const res1 = await request('POST', '/v1/orders', cashierSession.token, orderBody, key);
  assert.equal(res1.status, 201);
  assert.equal(res1.body.total_vnd, p.price_vnd * 2);
  assert.equal(res1.body.payment_status, 'UNPAID');
  assert.ok(res1.body.display_code.startsWith('B'));

  // ORDER-03: Same idempotency key and body returns EXACT same order
  const res2 = await request('POST', '/v1/orders', cashierSession.token, orderBody, key);
  assert.equal(res2.status, 201);
  assert.equal(res2.body.order_id, res1.body.order_id);
  assert.equal(res2.body.display_code, res1.body.display_code);

  // ORDER-04: Same key with changed payload returns 409 IDEMPOTENCY_PAYLOAD_MISMATCH
  const conflictRes = await request('POST', '/v1/orders', cashierSession.token, {
    ...orderBody,
    items: [{ product_id: p.id, qty: 3 }] // Changed qty!
  }, key);
  assert.equal(conflictRes.status, 409);
  assert.equal(conflictRes.body.code, 'IDEMPOTENCY_PAYLOAD_MISMATCH');

  // ORDER-02: Negative qty rejected
  const negQty = await request('POST', '/v1/orders', cashierSession.token, {
    catalog_version: cat.body.version,
    requested_payment_method: 'CASH',
    items: [{ product_id: p.id, qty: -1 }]
  }, 'e2e-order-neg-001');
  assert.ok([400, 422].includes(negQty.status));

  // Empty items rejected
  const emptyItems = await request('POST', '/v1/orders', cashierSession.token, {
    catalog_version: cat.body.version,
    requested_payment_method: 'CASH',
    items: []
  }, 'e2e-order-empty-001');
  assert.ok([400, 422].includes(emptyItems.status));

  // MOMO rejected when disabled
  const momoOrder = await request('POST', '/v1/orders', cashierSession.token, {
    catalog_version: cat.body.version,
    requested_payment_method: 'MOMO',
    items: [{ product_id: p.id, qty: 1 }]
  }, 'e2e-order-momo-001');
  assert.ok([400, 422].includes(momoOrder.status));
  assert.equal(momoOrder.body.code, 'METHOD_DISABLED');
});

test('SHIFT-01 & CASH-01..CASH-07: Cash shifts, exact tender/change, payments, refunds, and void', async () => {
  const cashierSession = await login('cashier', CASHIER_PIN);
  const cat = await request('GET', '/v1/catalog', cashierSession.token);
  const p = cat.body.products[0];

  // SHIFT-01: Open shift with 500,000 VND opening float
  const shiftRes = await request('POST', '/v1/cash-shifts/open', cashierSession.token, {
    opening_float_vnd: 500000
  }, 'e2e-shift-open-001');
  assert.equal(shiftRes.status, 201);
  const shiftId = shiftRes.body.id;
  assert.equal(shiftRes.body.opening_float_vnd, 500000);
  assert.equal(shiftRes.body.expected_cash_vnd, 500000);

  // Concurrent shift attempt rejected
  const secondShift = await request('POST', '/v1/cash-shifts/open', cashierSession.token, {
    opening_float_vnd: 300000
  }, 'e2e-shift-open-002');
  assert.equal(secondShift.status, 409);
  assert.equal(secondShift.body.code, 'SHIFT_ALREADY_OPEN');

  // CASH-01: Create order, pay with exact change calculation
  const order = (await request('POST', '/v1/orders', cashierSession.token, {
    catalog_version: cat.body.version,
    requested_payment_method: 'CASH',
    items: [{ product_id: p.id, qty: 2 }]
  }, 'e2e-cash-order-001')).body;

  const due = order.total_vnd;
  const tender = due + 30000; // Customer gives 30k more

  // CASH-02: Insufficient tender rejected
  const insufficient = await request('POST', `/v1/orders/${order.order_id}/payments/cash`, cashierSession.token, {
    shift_id: shiftId,
    cash_tendered_vnd: due - 1000,
    expected_order_version: order.version
  }, 'e2e-cash-short-001');
  assert.ok([400, 422].includes(insufficient.status));

  // Valid cash capture
  const payKey = 'e2e-cash-pay-idem-001';
  const payRes = await request('POST', `/v1/orders/${order.order_id}/payments/cash`, cashierSession.token, {
    shift_id: shiftId,
    cash_tendered_vnd: tender,
    expected_order_version: order.version
  }, payKey);
  assert.equal(payRes.status, 201);
  assert.equal(payRes.body.cash_change_vnd, 30000);
  assert.equal(payRes.body.cash_net_vnd, due);
  assert.equal(payRes.body.payment_status, 'PAID');

  // CASH-03: Replay same key returns exact payment receipt
  const payRetry = await request('POST', `/v1/orders/${order.order_id}/payments/cash`, cashierSession.token, {
    shift_id: shiftId,
    cash_tendered_vnd: tender,
    expected_order_version: order.version
  }, payKey);
  assert.equal(payRetry.status, 201);
  assert.equal(payRetry.body.payment_id, payRes.body.payment_id);

  // CASH-03: New key after settlement rejected with ORDER_SETTLED
  const payNewKey = await request('POST', `/v1/orders/${order.order_id}/payments/cash`, cashierSession.token, {
    shift_id: shiftId,
    cash_tendered_vnd: tender,
    expected_order_version: order.version
  }, 'e2e-cash-pay-newkey-002');
  assert.equal(payNewKey.status, 409);
  assert.equal(payNewKey.body.code, 'ORDER_SETTLED');

  // CASH-05: Staff requests BANK, Cashier collects CASH -> payments.method is CASH
  const bankReqOrder = (await request('POST', '/v1/orders', cashierSession.token, {
    catalog_version: cat.body.version,
    requested_payment_method: 'BANK',
    items: [{ product_id: p.id, qty: 1 }]
  }, 'e2e-bank-req-cash-paid-001')).body;
  assert.equal(bankReqOrder.requested_payment_method, 'BANK');

  const cashPayRes = await request('POST', `/v1/orders/${bankReqOrder.order_id}/payments/cash`, cashierSession.token, {
    shift_id: shiftId,
    cash_tendered_vnd: bankReqOrder.total_vnd,
    expected_order_version: bankReqOrder.version
  }, 'e2e-cash-pay-bankreq-001');
  assert.equal(cashPayRes.status, 201);
  assert.equal(cashPayRes.body.payment_status, 'PAID');

  // Receipts: PRINT-01 Batch has CUSTOMER and STORE copies
  const receipts = await request('GET', `/v1/orders/${bankReqOrder.order_id}/receipts`, cashierSession.token);
  assert.equal(receipts.status, 200);
  assert.equal(receipts.body.length, 2);
  const kinds = receipts.body.map(r => r.kind).sort();
  assert.deepEqual(kinds, ['CUSTOMER', 'STORE']);

  // PRINT-02: Audited reprint
  const reprintRes = await request('POST', `/v1/receipt-copies/${receipts.body[0].id}/reprint`, cashierSession.token, {
    reason: 'Kẹt giấy máy in — in lại liên khách'
  }, 'e2e-reprint-001');
  assert.equal(reprintRes.status, 409);
  assert.equal(reprintRes.body.code, 'RECEIPT_ALREADY_QUEUED');

  // CASH-06: Cash refund exactly once
  const refundKey = 'e2e-refund-idem-001';
  const refundRes = await request('POST', `/v1/orders/${order.order_id}/refunds/cash`, cashierSession.token, {
    shift_id: shiftId,
    reason: 'Khách đổi ý trả bánh'
  }, refundKey);
  assert.equal(refundRes.status, 201);
  assert.equal(refundRes.body.amount_vnd, due);
  assert.equal(refundRes.body.payment_status, 'REFUNDED');

  // Duplicate refund with same key returns original
  const refundRetry = await request('POST', `/v1/orders/${order.order_id}/refunds/cash`, cashierSession.token, {
    shift_id: shiftId,
    reason: 'Khách đổi ý trả bánh'
  }, refundKey);
  assert.equal(refundRetry.status, 201);
  assert.equal(refundRetry.body.refund_id, refundRes.body.refund_id);

  // Second refund with different key rejected
  const refundSecond = await request('POST', `/v1/orders/${order.order_id}/refunds/cash`, cashierSession.token, {
    shift_id: shiftId,
    reason: 'Thử hoàn lần 2'
  }, 'e2e-refund-second-002');
  assert.equal(refundSecond.status, 409);

  // CASH-07: Void unpaid order then capture rejected
  const voidOrder = (await request('POST', '/v1/orders', cashierSession.token, {
    catalog_version: cat.body.version,
    requested_payment_method: 'CASH',
    items: [{ product_id: p.id, qty: 1 }]
  }, 'e2e-void-order-001')).body;

  const voidRes = await request('POST', `/v1/orders/${voidOrder.order_id}/void`, cashierSession.token, {
    reason: 'Khách huỷ trước khi trả tiền'
  }, 'e2e-void-action-001');
  assert.equal(voidRes.status, 201);
  assert.equal(voidRes.body.status, 'VOIDED');

  // Attempting cash capture on voided order rejected
  const payVoided = await request('POST', `/v1/orders/${voidOrder.order_id}/payments/cash`, cashierSession.token, {
    shift_id: shiftId,
    cash_tendered_vnd: voidOrder.total_vnd,
    expected_order_version: voidOrder.version
  }, 'e2e-pay-voided-001');
  assert.equal(payVoided.status, 409);

  // SHIFT-02: Cash movement ADD, close shift with count & variance
  const addMove = await request('POST', `/v1/cash-shifts/${shiftId}/movements`, cashierSession.token, {
    kind: 'ADD',
    amount_vnd: 50000,
    reason: 'Chủ bổ sung tiền lẻ'
  }, 'e2e-add-cash-001');
  assert.equal(addMove.status, 201);

  // Close shift
  const currentShift = (await request('GET', '/v1/cash-shifts/current', cashierSession.token)).body;
  const counted = currentShift.expected_cash_vnd - 10000; // 10k missing
  const closeRes = await request('POST', `/v1/cash-shifts/${shiftId}/close`, cashierSession.token, {
    counted_cash_vnd: counted,
    reason: 'Thiếu 10k tiền lẻ sau đối soát ca'
  }, 'e2e-shift-close-001');
  assert.equal(closeRes.status, 201);
  assert.equal(closeRes.body.status, 'CLOSED');
  assert.equal(closeRes.body.variance_vnd, -10000);
});

test('BANK-01 & BANK-02: Bank intent PENDING & verified HMAC settlement', async () => {
  const cashierSession = await login('cashier', CASHIER_PIN);
  const cat = await request('GET', '/v1/catalog', cashierSession.token);
  const p = cat.body.products[0];

  const order = (await request('POST', '/v1/orders', cashierSession.token, {
    catalog_version: cat.body.version,
    requested_payment_method: 'BANK',
    items: [{ product_id: p.id, qty: 1 }]
  }, 'e2e-bank-intent-order-001')).body;

  // Create bank intent
  const intentRes = await request('POST', `/v1/orders/${order.order_id}/payments/bank-intent`, cashierSession.token, {}, 'e2e-create-intent-001');
  assert.equal(intentRes.status, 201);
  assert.equal(intentRes.body.status, 'PENDING');
  assert.ok(intentRes.body.reference);

  // BANK-01: Order remains UNPAID until bridge verification
  const checkUnpaid = await request('GET', `/v1/orders/${order.order_id}`, cashierSession.token);
  assert.equal(checkUnpaid.body.payment_status, 'UNPAID');

  // BANK-02: Signed HMAC bridge webhook simulation
  const now = Date.now();
  const bankPayload = {
    provider_tx_id: 'sepay_tx_test_998877',
    order_id: order.order_id,
    reference: intentRes.body.reference,
    bank_code: BANK_CODE,
    account_number: BANK_ACCOUNT_NUMBER,
    amount_vnd: order.total_vnd,
    direction: 'CREDIT'
  };
  const bodyStr = JSON.stringify(bankPayload);
  const sig = createHmac('sha256', BANK_SECRET)
    .update(`${now}.${bodyStr}`)
    .digest('hex');

  // Bad HMAC rejected
  const badHmac = await request('POST', '/v1/internal/bank-events', null, bankPayload, null, {
    'x-bmc-timestamp': String(now),
    'x-bmc-signature': '0000000000000000000000000000000000000000000000000000000000000000'
  });
  assert.equal(badHmac.status, 401);

  // Valid HMAC settles payment
  const validBank = await request('POST', '/v1/internal/bank-events', null, bankPayload, null, {
    'x-bmc-timestamp': String(now),
    'x-bmc-signature': sig
  });
  assert.equal(validBank.status, 201);
  assert.equal(validBank.body.state, 'CONFIRMED');
  assert.equal(validBank.body.duplicate, false);

  // Check order is now PAID
  const paidOrder = await request('GET', `/v1/orders/${order.order_id}`, cashierSession.token);
  assert.equal(paidOrder.body.payment_status, 'PAID');

  // Two receipt copies created for BANK
  const bankReceipts = await request('GET', `/v1/orders/${order.order_id}/receipts`, cashierSession.token);
  assert.equal(bankReceipts.body.length, 2);

  // Replay of same bank event is duplicate-safe
  const replay = await request('POST', '/v1/internal/bank-events', null, bankPayload, null, {
    'x-bmc-timestamp': String(now),
    'x-bmc-signature': sig
  });
  assert.equal(replay.status, 201);
  assert.equal(replay.body.state, 'CONFIRMED');
  assert.equal(replay.body.duplicate, true);
});

test('ANALYTICS-01 & ANALYTICS-02: Owner reports reconcile integer sales without caps', async () => {
  const ownerSession = await login('owner', OWNER_PIN);

  const todayCounts = await request('GET', '/v1/owner/analytics/today', ownerSession.token);
  assert.equal(todayCounts.status, 200);
  assert.ok(todayCounts.body.total_orders > 0);
  assert.ok(todayCounts.body.paid_orders >= 1);
  assert.ok(todayCounts.body.refunded_orders >= 1);
  assert.ok(todayCounts.body.voided_orders >= 1);

  const productSales = await request('GET', '/v1/owner/analytics/products?period=day', ownerSession.token);
  assert.equal(productSales.status, 200);
  assert.equal(productSales.body.sales_definition, 'PAID_ONLY_BY_ORDER_CREATED_AT');
  assert.ok(productSales.body.total_units_sold > 0);
  assert.ok(productSales.body.gross_vnd > 0);
});
