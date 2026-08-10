import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/redis/**/*.test.ts', 'test/integration/mqtt/**/*.test.ts'],
    environment: 'node',
  },
});
