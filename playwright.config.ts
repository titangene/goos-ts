import { defineConfig } from '@playwright/test';

// 不設定共用的 webServer：每個測試都由 test/e2e/ApplicationRunner.ts 自行
// spawn/kill 一份全新的 server process、直接用絕對網址呼叫
// page.goto()（見該檔案開頭的說明），不需要 Playwright 的 webServer/
// baseURL 機制。
export default defineConfig({
  fullyParallel: false,
  workers: 1,
  testDir: './test/e2e'
});
