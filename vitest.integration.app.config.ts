import { defineVitestConfig } from '@nuxt/test-utils/config';

export default defineVitestConfig({
  test: {
    include: ['test/integration/app/**/*.test.ts'],
    environment: 'nuxt'
  }
});
