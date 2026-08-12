import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

export default defineConfig({
  resolve: {
    alias: {
      '@server': fileURLToPath(new URL('./server', import.meta.url)),
      '@app': fileURLToPath(new URL('./app', import.meta.url)),
      '@test': fileURLToPath(new URL('./test', import.meta.url))
    }
  },
  test: {
    include: ['test/integration/redis/**/*.test.ts'],
    environment: 'node'
  }
});
