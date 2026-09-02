export default defineNuxtConfig({
  compatibilityDate: '2025-08-27',
  modules: ['@nuxt/eslint', '@vueuse/nuxt'],
  nitro: {
    experimental: {
      websocket: true
    }
  },
  runtimeConfig: {
    xmppUsername: '',
    xmppPassword: '',
    public: {
      xmppServiceUrl: ''
    }
  }
});