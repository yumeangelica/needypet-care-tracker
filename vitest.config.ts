import { defineVitestConfig } from '@nuxt/test-utils/config';

export default defineVitestConfig({
  test: {
    // Fast node env by default; component tests opt into the nuxt
    // environment per-file with `// @vitest-environment nuxt`.
    // Integration tests need a running server and live behind their own
    // config (vitest.integration.config.ts / bun run test:integration).
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts'],
  },
});
