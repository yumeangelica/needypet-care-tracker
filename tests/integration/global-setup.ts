import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFixture,
  createTestContext,
  loadFixture,
  startServer,
  stopServer,
  useTestContext,
} from '@nuxt/test-utils/e2e';
import Database from 'better-sqlite3';
import { consola } from 'consola';
import { drizzle } from 'drizzle-orm/better-sqlite3';
import { migrate } from 'drizzle-orm/better-sqlite3/migrator';

/**
 * Builds the app once and boots ONE production Nitro server for the whole
 * integration suite (per-file `setup()` would rebuild for every spec file).
 * The production build never runs the dev-only migrate plugin, so the
 * throwaway SQLite database is migrated here, before the server boots.
 */
export default async function globalSetup(): Promise<() => Promise<void>> {
  const rootDir = fileURLToPath(new URL('../..', import.meta.url));
  const tempDir = mkdtempSync(join(tmpdir(), 'needypet-itest-'));
  const dbFile = join(tempDir, 'test.sqlite');
  const uploadsDir = join(tempDir, 'uploads');
  mkdirSync(uploadsDir, { recursive: true });

  const sqlite = new Database(dbFile);
  const db = drizzle(sqlite);
  migrate(db, { migrationsFolder: resolve(rootDir, 'server/db/migrations/sqlite') });
  sqlite.close();

  createTestContext({
    rootDir,
    server: true,
    build: true,
    env: {
      NUXT_DB_FILE: dbFile,
      // The server reads plain process.env, so an inherited production URL
      // must be blanked or the suite would silently target Postgres.
      NUXT_DB_URL: '',
      NUXT_SESSION_PASSWORD: 'needypet-integration-test-session-password',
      NUXT_UPLOADS_DIR: uploadsDir,
      NUXT_MAILER_PROVIDER: '',
    },
  });
  await loadFixture();
  await buildFixture();
  // The in-process nuxt build wraps stdout/stderr through consola and leaves
  // the wrap in place; without this restore the vitest reporter goes silent.
  consola.restoreAll();
  await startServer();

  const ctx = useTestContext();
  // Test workers spawn after globalSetup; plain env is the handoff channel.
  process.env.NUXT_TEST_URL = ctx.url;
  process.env.NUXT_TEST_DB_FILE = dbFile;

  return async () => {
    await stopServer();
    // Runs the buildDir cleanup registered by loadFixture (.nuxt/test/<id>).
    for (const fn of ctx.teardown ?? []) {
      await fn();
    }
    rmSync(tempDir, { recursive: true, force: true });
  };
}
