import { defineConfig } from 'vitest/config';

/**
 * Endpoint/integration tests: real HTTP against one built Nitro server that
 * global-setup boots on a throwaway SQLite database. Plain vitest config on
 * purpose — the specs run in node and talk to the server over fetch, so the
 * Nuxt test environment (and defineVitestConfig) is not needed here.
 */
export default defineConfig({
  test: {
    environment: 'node',
    include: ['tests/integration/**/*.spec.ts'],
    globalSetup: ['./tests/integration/global-setup.ts'],
    // One shared server + database: files must not interleave.
    fileParallelism: false,
    testTimeout: 15_000,
  },
});
