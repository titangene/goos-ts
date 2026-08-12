import { fileURLToPath } from 'node:url';

// https://nuxt.com/docs/api/configuration/nuxt-config
export default defineNuxtConfig({
  compatibilityDate: '2025-07-15',
  devtools: { enabled: true },
  modules: ['@nuxt/eslint'],
  alias: {
    '@server': fileURLToPath(new URL('./server', import.meta.url)),
    '@app': fileURLToPath(new URL('./app', import.meta.url)),
    '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
    '@test': fileURLToPath(new URL('./test', import.meta.url))
  },
  nitro: {
    experimental: {
      websocket: true
    }
  },
  // https://nuxt.com/docs/4.x/getting-started/testing#typescript-support-in-tests
  // test/integration/app/ 會 import .vue 元件（走 @nuxt/test-utils 的
  // mountSuspended），併入 app context 才能用 vue-tsc 正確檢查，不用另外
  // 寫 *.vue 型別宣告檔繞過去。
  typescript: {
    tsConfig: {
      include: ['../test/integration/app/**/*']
    }
  },
  runtimeConfig: {
    sniperId: 'sniper'
  }
});
