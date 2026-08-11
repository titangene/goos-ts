import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/integration/mqtt/**/*.test.ts', 'test/integration/redis/**/*.test.ts'],
    environment: 'node',
  },
});
