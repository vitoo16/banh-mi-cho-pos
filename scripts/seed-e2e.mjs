/** Isolated BMC E2E seed against a running local Store Hub. Node 24+. */
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { writeFileSync } from 'node:fs';

const base = process.env.E2E_HUB_URL || 'http://127.0.0.1:4400';
if (process.env.E2E_ALLOW_SEED !== 'YES' ||
    process.env.E2E_ISOLATED_DB_MARKER !== 'BMC_E2E_DISPOSABLE' ||
    !/^http:\/\/127\.0\.0\.1:4400\/?$/.test(base)) {
  throw new Error('REFUSED: require explicit seed flags and loopback Hub 127.0.0.1:4400');
}
const pins = {
  owner: process.env.BOOTSTRAP_OWNER_PIN,
  cashier: process.env.BOOTSTRAP_CASHIER_PIN,
  staff: process.env.BOOTSTRAP_STAFF_PIN
};
const extraStaffPin = process.env.E2E_EXTRA_STAFF_PIN;
if (Object.values(pins).some(v => !v || v.length < 12) ||
    !extraStaffPin || extraStaffPin.length < 12) {
  throw new Error('Supply four distinct QA PINs >=12 chars through local environment; no defaults');
}
if (new Set([...Object.values(pins), extraStaffPin]).size !== 4) {
  throw new Error('Bootstrap and extra Staff QA PINs must all be distinct');
}
const count = Number(process.env.E2E_SEED_ORDERS || '340');
if (!Number.isInteger(count) || count < 20 || count > 600) {
  throw new Error('E2E_SEED_ORDERS must be integer 20..600');
}
async function api(method, path, token, body, key) {
  const response = await fetch(base + path, {
    method,
    headers: {
      ...(token ? { authorization: 'Bearer ' + token } : {}),
      ...(body ? { 'content-type': 'application/json' } : {}),
      ...(key ? { 'idempotency-key': key } : {})
    },
    body: body ? JSON.stringify(body) : undefined
  });
  const data = await response.json().catch(() => ({}));
  if (!response.ok) throw new Error(method + ' ' + path + ': ' + response.status + ' ' + JSON.stringify(data));
  return data;
}
const idem = (prefix, i) => 'bmc-e2e-' + prefix + '-' + String(i).padStart(5, '0');
async function login(user) {
  return (await api('POST', '/v1/auth/login', null, { user_id: user, pin: pins[user] })).token;
}

const health = await api('GET', '/v1/health');
assert.equal(health.mode, 'PILOT_LOCAL');
const owner = await login('owner');
const cashier = await login('cashier');
const staff = await login('staff');
const catalog = await api('GET', '/v1/catalog', staff);
assert.ok(catalog.products.length >= 2, 'Enable demo catalog on a fresh QA DB');
const p1 = catalog.products.find(p => p.id === 'bm-thit') || catalog.products[0];
const p2 = catalog.products.find(p => p.id === 'bm-dacbiet') || catalog.products[1];

const initial = await api('GET', '/v1/owner/analytics/today', owner);
const initialHistory = await api('GET', '/v1/orders/history?limit=1', owner);
if (initial.total_orders !== 0 || (initialHistory.items || []).length !== 0) {
  throw new Error('REFUSED: order history is not empty; use a brand-new disposable DB');
}

const employees = [];
for (let i = 1; i <= 7; i++) {
  const id = 'qa_staff_' + i;
  const created = await api('POST', '/v1/owner/employees', owner, {
    id, name: 'QA Nhan vien ' + i, role: 'STAFF', pin: extraStaffPin
  }, idem('employee', i));
  employees.push(created.id);
}
const shift = await api('POST', '/v1/cash-shifts/open', cashier,
  { opening_float_vnd: 500000 }, idem('shift', 1));

const report = {
  seed_version: 2, store: 'LOCAL_ISOLATED', run_id: randomUUID(),
  created_at: new Date().toISOString(), catalog_version: catalog.version,
  shift_id: shift.id, employees, orders: [],
  expected: {
    total_orders: count, paid_orders: 0, voided_orders: 0,
    refunded_orders: 0, pending_orders: 0, paid_units_by_product: {},
    net_cash_vnd: 0
  }
};

for (let i = 0; i < count; i++) {
  const product = i % 3 === 0 ? p2 : p1;
  const qty = 1 + (i % 3);
  const method = i % 5 === 0 ? 'BANK' : 'CASH';
  const body = {
    catalog_version: catalog.version,
    requested_payment_method: method,
    items: [{
      product_id: product.id, qty,
      note: i % 17 === 0 ? 'Khong hanh — Unicode QA' : ''
    }],
    note: i % 23 === 0 ? 'QA test order' : ''
  };
  const key = idem('order', i);
  const order = await api('POST', '/v1/orders', staff, body, key);
  const retry = await api('POST', '/v1/orders', staff, body, key);
  assert.equal(order.order_id, retry.order_id, 'Idempotent retry must return same order');

  const record = {
    i, order_id: order.order_id, display_code: order.display_code,
    total_vnd: order.total_vnd, qty, product_id: product.id,
    requested_method: method, expected_status: 'UNPAID'
  };
  if (i % 19 === 0) {
    await api('POST', '/v1/orders/' + order.order_id + '/void', cashier,
      { reason: 'QA customer cancelled' }, idem('void', i));
    record.expected_status = 'VOIDED';
    report.expected.voided_orders++;
  } else if (i % 7 === 0) {
    const tender = Math.ceil(order.total_vnd / 50000) * 50000;
    const captured = await api('POST',
      '/v1/orders/' + order.order_id + '/payments/cash', cashier,
      { shift_id: shift.id, cash_tendered_vnd: tender, expected_order_version: 1 },
      idem('cash', i));
    assert.equal(captured.cash_net_vnd, order.total_vnd);
    record.expected_status = 'PAID';
    report.expected.paid_orders++;
    report.expected.net_cash_vnd += order.total_vnd;
    report.expected.paid_units_by_product[product.id] =
      (report.expected.paid_units_by_product[product.id] || 0) + qty;
    if (i % 49 === 7) {
      await api('POST', '/v1/orders/' + order.order_id + '/refunds/cash', cashier,
        { shift_id: shift.id, reason: 'QA refund' }, idem('refund', i));
      record.expected_status = 'REFUNDED';
      report.expected.paid_orders--;
      report.expected.refunded_orders++;
      report.expected.net_cash_vnd -= order.total_vnd;
      report.expected.paid_units_by_product[product.id] -= qty;
    }
  } else {
    report.expected.pending_orders++;
  }
  report.orders.push(record);
}

const actual = await api('GET', '/v1/owner/analytics/today', owner);
for (const key of ['total_orders', 'paid_orders', 'voided_orders', 'refunded_orders', 'pending_orders']) {
  assert.equal(actual[key], report.expected[key], 'Mismatch ' + key);
}
const dashboard = await api('GET', '/v1/owner/dashboard', owner);
assert.equal(dashboard.cash_vnd, report.expected.net_cash_vnd, 'Cash ledger mismatch');
assert.equal(dashboard.bank_vnd, 0, 'No real bank captures are part of this seed');
const codes = report.orders.map(o => o.display_code);
assert.equal(new Set(codes).size, count, 'Display codes must be unique');

const output = process.env.E2E_SEED_REPORT || './e2e-seed-report.json';
writeFileSync(output, JSON.stringify({
  ...report, actual_dashboard: dashboard, actual_today: actual
}, null, 2));
console.log('Seed OK: ' + count + ' orders. Report: ' + output);
