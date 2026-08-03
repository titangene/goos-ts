import { defineConfig } from '@playwright/test';

export default defineConfig({
  testDir: './test/e2e',
  fullyParallel: false,
  workers: 1,
  webServer: {
    command: 'npm run build && node .output/server/index.mjs',
    url: 'http://localhost:3000',
    reuseExistingServer: !process.env.CI,
    env: {
      NUXT_SNIPER_ID: 'sniper@localhost',
    },
  },
  use: {
    baseURL: 'http://localhost:3000',
  },
});
