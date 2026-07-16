import { defineVitestConfig } from '@nuxt/test-utils/config';

export default defineVitestConfig({
  test: {
    // `node` is Vitest's lightweight environment model; Vitest itself still
    // runs inside Bun (`bun --bun vitest`). Component tests opt into the Nuxt
    // environment per-file with `// @vitest-environment nuxt`.
    // Integration tests need a running server and live behind their own
    // config (vitest.integration.config.ts / bun run test:integration).
    environment: 'node',
    include: ['tests/unit/**/*.spec.ts'],
    // Under `bun --bun vitest`, zod v4's package resolves in a way that leaves
    // the `z` import undefined in the schema specs. Inlining routes zod through
    // Vite's transform so it loads consistently on the Bun runtime.
    server: { deps: { inline: ['zod'] } },
  },
});
