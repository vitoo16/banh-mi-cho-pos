import {defineConfig,devices} from '@playwright/test';
export default defineConfig({
 testDir:'./tests/ui',timeout:30000,retries:1,reporter:'list',
 use:{baseURL:'http://127.0.0.1:5173',trace:'retain-on-failure',screenshot:'only-on-failure'},
 projects:[{name:'chromium',use:{...devices['Desktop Chrome']}}],
 webServer:[
  {command:'npm run dev:pos',url:'http://127.0.0.1:5173',reuseExistingServer:!process.env.CI,timeout:90000},
  {command:'npm run dev:owner',url:'http://127.0.0.1:5174',reuseExistingServer:!process.env.CI,timeout:90000}
 ]
});
