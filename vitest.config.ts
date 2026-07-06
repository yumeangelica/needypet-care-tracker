import { defineVitestConfig } from '@nuxt/test-utils/config';

export default defineVitestConfig({
  test: {
    // Fast node env by default; component tests opt into the nuxt
    // environment per-file with `// @vitest-environment nuxt`.
    environment: 'node',
    include: ['tests/**/*.spec.ts'],
  },
});
