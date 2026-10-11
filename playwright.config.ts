import {defineConfig,devices} from '@playwright/test';

export default defineConfig({
  testDir:'./tests/ui',
  timeout:35_000,
  expect:{timeout:8_000},
  fullyParallel:true,
  forbidOnly:!!process.env.CI,
  retries:process.env.CI?1:0,
  workers:process.env.CI?2:undefined,
  reporter:process.env.CI?'github':'list',
  outputDir:'test-results',
  use:{
    baseURL:'http://127.0.0.1:5173',
    trace:'retain-on-failure',
    screenshot:'only-on-failure',
    actionTimeout:10_000,
  },
  projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
  webServer:[
    {command:'npm run dev:pos',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI,timeout:100_000},
    {command:'npm run dev:owner',url:'http://127.0.0.1:5174',reuseExistingServer:!process.env.CI,timeout:100_000},
    {command:'npm run dev:owner -- --port 5175 --strictPort',env:{VITE_CLOUD_API_URL:'http://127.0.0.1:5175'},url:'http://127.0.0.1:5175',reuseExistingServer:!process.env.CI,timeout:100_000},
  ],
});
