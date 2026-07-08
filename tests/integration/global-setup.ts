import { mkdirSync, mkdtempSync, rmSync } from 'node:fs';
import { createServer } from 'node:net';
import { tmpdir } from 'node:os';
import { join, resolve } from 'node:path';
import { fileURLToPath } from 'node:url';
import {
  buildFixture,
  createTestContext,
  loadFixture,
  useTestContext,
} from '@nuxt/test-utils/e2e';
import { Database } from 'bun:sqlite';
import { consola } from 'consola';
import { drizzle } from 'drizzle-orm/bun-sqlite';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';

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
  let serverProcess: Bun.Subprocess<'ignore', 'inherit', 'inherit'> | null = null;
  mkdirSync(uploadsDir, { recursive: true });

  try {
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
        NUXT_DIGEST_SECRET: 'itest-digest-secret',
      },
    });
    await loadFixture();
    await buildFixture();
    // The in-process nuxt build wraps stdout/stderr through consola and leaves
    // the wrap in place; without this restore the vitest reporter goes silent.
    consola.restoreAll();

    const ctx = useTestContext();
    const startedServer = await startBuiltServer(rootDir, ctx.options.env);
    serverProcess = startedServer.process;
    ctx.url = startedServer.url;

    // Test workers spawn after globalSetup; plain env is the handoff channel.
    process.env.NUXT_TEST_URL = ctx.url;
    process.env.NUXT_TEST_DB_FILE = dbFile;

    return async () => {
      await stopBuiltServer(serverProcess);
      // Runs the buildDir cleanup registered by loadFixture (.nuxt/test/<id>).
      for (const fn of ctx.teardown ?? []) {
        await fn();
      }
      rmSync(tempDir, { recursive: true, force: true });
    };
  } catch (error) {
    await stopBuiltServer(serverProcess);
    rmSync(tempDir, { recursive: true, force: true });
    throw error;
  }
}

async function startBuiltServer(
  rootDir: string,
  env: Record<string, unknown>,
): Promise<{ process: Bun.Subprocess<'ignore', 'inherit', 'inherit'>; url: string }> {
  const host = '127.0.0.1';
  const port = await getFreePort(host);
  const url = `http://${host}:${port}/`;
  const subprocess = Bun.spawn(['bun', '.output/server/index.mjs'], {
    cwd: rootDir,
    stdout: 'inherit',
    stderr: 'inherit',
    env: {
      ...process.env,
      PORT: String(port),
      HOST: host,
      NODE_ENV: 'test',
      ...stringifyEnv(env),
    },
  });

  try {
    await waitForBuiltServer(url, subprocess);
    return { process: subprocess, url };
  } catch (error) {
    await stopBuiltServer(subprocess);
    throw error;
  }
}

function getFreePort(host: string): Promise<number> {
  return new Promise((resolvePort, reject) => {
    const server = createServer();
    server.once('error', reject);
    server.listen(0, host, () => {
      const address = server.address();
      server.close(() => {
        if (typeof address === 'object' && address) {
          resolvePort(address.port);
          return;
        }
        reject(new Error('Could not allocate an integration test server port'));
      });
    });
  });
}

async function waitForBuiltServer(
  url: string,
  subprocess: Bun.Subprocess<'ignore', 'inherit', 'inherit'>,
): Promise<void> {
  const deadline = Date.now() + 60_000;
  let lastError: unknown;

  while (Date.now() < deadline) {
    if (subprocess.exitCode !== null) {
      throw new Error(`Integration test server exited before becoming ready: ${subprocess.exitCode}`);
    }

    try {
      const response = await fetch(url, { signal: AbortSignal.timeout(10_000) });
      if (response.status < 500) {
        return;
      }
      lastError = new Error(`Integration test server responded with ${response.status}`);
    } catch (error) {
      lastError = error;
    }
    await sleep(100);
  }

  throw lastError instanceof Error
    ? lastError
    : new Error(`Timed out waiting for integration test server at ${url}`);
}

async function stopBuiltServer(
  subprocess: Bun.Subprocess<'ignore', 'inherit', 'inherit'> | null,
): Promise<void> {
  if (!subprocess) {
    return;
  }

  subprocess.kill();
  await Promise.race([subprocess.exited.catch(() => undefined), sleep(5_000)]);
  if (subprocess.exitCode === null) {
    subprocess.kill('SIGKILL');
    await Promise.race([subprocess.exited.catch(() => undefined), sleep(5_000)]);
  }
}

function stringifyEnv(env: Record<string, unknown>): Record<string, string> {
  return Object.fromEntries(
    Object.entries(env)
      .filter(([, value]) => value !== undefined)
      .map(([key, value]) => [key, String(value)]),
  );
}

function sleep(ms: number): Promise<void> {
  return new Promise((resolveSleep) => setTimeout(resolveSleep, ms));
}
