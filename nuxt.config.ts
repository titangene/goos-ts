export default defineNuxtConfig({
  compatibilityDate: '2025-08-27',
  modules: ['@nuxt/eslint'],
  runtimeConfig: {
    xmppUsername: '',
    xmppPassword: '',
    public: {
      xmppServiceUrl: ''
    }
  }
});
