/**
 * Starts a fresh, loopback-only Store Hub for Playwright real-process E2E.
 * The temporary SQLite database is removed only after the Hub process exits.
 * Never inherit STORE_DB_PATH from a developer or production environment.
 */
import { spawn } from 'node:child_process';
import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';

const host = process.env.HUB_BIND_HOST || '127.0.0.1';
const port = Number(process.env.HUB_PORT || '4400');
const pins = [
  process.env.BOOTSTRAP_OWNER_PIN,
  process.env.BOOTSTRAP_CASHIER_PIN,
  process.env.BOOTSTRAP_STAFF_PIN,
];

if (process.env.NODE_ENV === 'production') {
  throw new Error('Refusing to start a Playwright Hub with NODE_ENV=production');
}
if (host !== '127.0.0.1') {
  throw new Error('Playwright E2E Hub must bind to 127.0.0.1 only');
}
if (!Number.isInteger(port) || port < 1024 || port > 65535) {
  throw new Error('Invalid isolated Playwright Hub port');
}
if (pins.some(pin => typeof pin !== 'string' || pin.length < 12) ||
    new Set(pins).size !== pins.length) {
  throw new Error('Playwright E2E requires three distinct QA bootstrap PINs of at least 12 characters');
}

const tempDir = mkdtempSync(join(tmpdir(), 'bmc-playwright-hub-'));
const dbPath = join(tempDir, 'hub.sqlite');
let stopping = false;
let cleaned = false;

function cleanup() {
  if (cleaned) return;
  cleaned = true;
  rmSync(tempDir, { recursive: true, force: true });
}

const childEnv = {
  ...process.env,
  NODE_ENV: 'test',
  STORE_DB_PATH: dbPath,
  HUB_BIND_HOST: host,
  HUB_PORT: String(port),
  SEED_DEMO_CATALOG: '1',
};
// A test run must never connect to external devices or financial services even
// if those secrets are present in the invoking developer's shell.
for (const key of [
  'PRINTER_HOST', 'PRINTER_PORT', 'BANK_CODE', 'BANK_ACCOUNT_NUMBER',
  'BANK_BRIDGE_SECRET', 'ENABLE_VERIFIED_BANK_INBOX', 'CLOUD_SYNC_URL',
  'CLOUD_SYNC_SECRET', 'CLOUD_STORE_ID', 'ALLOW_INSECURE_LAN_DEV',
  'PAIRING_ENFORCED', 'HUB_TLS_CERT_PATH', 'HUB_TLS_KEY_PATH',
]) {
  delete childEnv[key];
}

const child = spawn(process.execPath, [resolve('apps/store-hub/dist/main.js')], {
  env: childEnv,
  stdio: 'inherit',
  windowsHide: true,
});

function forwardSignal(signal) {
  stopping = true;
  if (child.exitCode === null && child.signalCode === null) child.kill(signal);
}

process.once('SIGINT', () => forwardSignal('SIGINT'));
process.once('SIGTERM', () => forwardSignal('SIGTERM'));

child.once('error', error => {
  console.error('[PLAYWRIGHT HUB] Failed to spawn Store Hub:', error);
  cleanup();
  process.exitCode = 1;
});

child.once('exit', (code, signal) => {
  cleanup();
  process.exitCode = stopping ? 0 : (code ?? (signal ? 1 : 0));
});
