import { defineVitestProject } from '@nuxt/test-utils/config';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vitest/config';

const alias = {
  '@server': fileURLToPath(new URL('./server', import.meta.url)),
  '@app': fileURLToPath(new URL('./app', import.meta.url)),
  '@shared': fileURLToPath(new URL('./shared', import.meta.url)),
  '@test': fileURLToPath(new URL('./test', import.meta.url))
};

export default defineConfig({
  test: {
    projects: [
      {
        resolve: { alias },
        test: {
          name: 'unit',
          include: ['test/unit/**/*.test.ts'],
          environment: 'node'
        }
      },
      {
        resolve: { alias },
        test: {
          name: 'integration-redis',
          include: ['test/integration/redis/**/*.test.ts'],
          environment: 'node'
        }
      },
      await defineVitestProject({
        test: {
          name: 'integration-app',
          include: ['test/integration/app/**/*.test.ts'],
          environment: 'nuxt'
        }
      })
    ]
  }
});
