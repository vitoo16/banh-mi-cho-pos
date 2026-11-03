import { defineConfig, devices } from '@playwright/test';

export default defineConfig({
  testDir: './tests/e2e',
  testMatch: '**/*.spec.ts',
  timeout: 60_000,
  expect: { timeout: 10_000 },
  fullyParallel: false,
  workers: 1,
  reporter: process.env.CI ? 'github' : 'list',
  use: {
    baseURL: 'http://127.0.0.1:5173',
    trace: 'retain-on-failure',
    screenshot: 'only-on-failure',
    actionTimeout: 10_000
  },
  projects: [
    { name: 'chromium', use: { ...devices['Desktop Chrome'] } }
  ],
  webServer: [
    {
      command: 'node apps/store-hub/dist/main.js',
      url: 'http://127.0.0.1:4400/v1/health',
      env: {
        STORE_DB_PATH: './store-data/e2e-disposable/bmc-e2e-playwright.sqlite',
        HUB_BIND_HOST: '127.0.0.1',
        HUB_PORT: '4400',
        SEED_DEMO_CATALOG: '1',
        BOOTSTRAP_OWNER_PIN: 'e2e-pw-owner-pin-9999',
        BOOTSTRAP_CASHIER_PIN: 'e2e-pw-cashier-pin-8888',
        BOOTSTRAP_STAFF_PIN: 'e2e-pw-staff-pin-7777',
        CORS_ORIGINS: 'http://127.0.0.1:5173,http://127.0.0.1:5174,http://localhost:5173,http://localhost:5174'
      },
      reuseExistingServer: false,
      timeout: 30_000
    },
    {
      command: 'npm run dev:pos',
      url: 'http://127.0.0.1:5173',
      reuseExistingServer: false,
      timeout: 30_000
    },
    {
      command: 'npm run dev:owner',
      url: 'http://127.0.0.1:5174',
      reuseExistingServer: false,
      timeout: 30_000
    }
  ]
});
