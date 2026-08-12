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
  runtimeConfig: {
    sniperId: 'sniper'
  }
});
