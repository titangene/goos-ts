import { defineConfig } from '@playwright/test';

export default defineConfig({
  fullyParallel: false,
  workers: 1,
  // redis-e2e 用的長駐 server，AUCTION_TRANSPORT 預設 redis（ADR-0002）。
  // 注意：Playwright 執行任何一個 project 時都會啟動這個 webServer，即使
  // 只跑 --project=xmpp-e2e 也一樣（Playwright 本身的限制，webServer 不是
  // per-project 的設定）——xmpp-e2e 自己的 server 生命週期由
  // test/e2e-xmpp/ApplicationRunner.ts 逐一測試 spawn/kill 管理，見該檔案
  // 開頭的說明。
  webServer: {
    command: 'npm run build && node .output/server/index.mjs',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      NUXT_SNIPER_ID: 'sniper',
      AUCTION_TRANSPORT: 'redis'
    }
  },
  projects: [
    {
      name: 'redis-e2e',
      testDir: './test/e2e',
      use: {
        baseURL: 'http://localhost:3000'
      }
    },
    {
      // 執行前須先手動 `npm run build`（跟 npm run test:integration:xmpp
      // 一樣，XMPP 路徑目前不進 npm test 彙總指令/CI，見 ADR-0008
      // Consequences），也需要本機有真實 Prosody 在跑（見 README「XMPP
      // 實驗版本」）。
      name: 'xmpp-e2e',
      testDir: './test/e2e-xmpp'
    }
  ]
});
