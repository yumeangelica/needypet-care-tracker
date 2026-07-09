import { readFileSync } from 'node:fs';
import { join } from 'node:path';
import { migrate } from 'drizzle-orm/bun-sqlite/migrator';
import { useDb, withTransaction } from './index';
import { careRecords, needs, petCaretakers, pets, users } from './schema';
import type { ImportContext, PreparedRows, RawBundle } from './import/validate';
import { validateBundle } from './import/validate';

/**
 * Legacy JSON bundle importer (documentation/migration.md). All-or-nothing:
 * the bundle is fully validated before the database is touched, and the
 * inserts run in a single transaction.
 *
 * Usage: bun run db:import <bundleDir> [--dry-run]
 * Honours NUXT_DB_FILE like the rest of the server.
 */

const MAX_PRINTED_ERRORS = 20;
// Keep parameter counts safely under SQLite's per-statement variable limit.
const INSERT_CHUNK_SIZE = 100;

const args = process.argv.slice(2);
const dryRun = args.includes('--dry-run');
const bundleDir = args.find((arg) => !arg.startsWith('--'));

if (!bundleDir) {
  console.error('Usage: bun run db:import <bundleDir> [--dry-run]');
  process.exit(1);
}

function readJsonFile(name: string): unknown {
  const path = join(bundleDir!, name);
  let text: string;
  try {
    text = readFileSync(path, 'utf8');
  } catch {
    console.error(`Cannot read ${path}`);
    process.exit(1);
  }
  try {
    return JSON.parse(text);
  } catch (error) {
    console.error(`${name} is not valid JSON: ${error instanceof Error ? error.message : String(error)}`);
    process.exit(1);
  }
}

const bundle: RawBundle = {
  manifest: readJsonFile('manifest.json'),
  users: readJsonFile('users.json'),
  pets: readJsonFile('pets.json'),
  petCaretakers: readJsonFile('pet_caretakers.json'),
  needs: readJsonFile('needs.json'),
  careRecords: readJsonFile('care_records.json'),
};

if (process.env.NUXT_DB_URL) {
  console.error('db:import is a local SQLite dev tool - refusing to run against a remote DB (NUXT_DB_URL)');
  process.exit(1);
}

const db = useDb();
migrate(db, { migrationsFolder: 'server/db/migrations/sqlite' });

const nonNull = (values: (string | null)[]): Set<string> =>
  new Set(values.filter((value): value is string => value !== null));

const context: ImportContext = {
  existingLegacyIds: {
    users: nonNull((await db.select({ v: users.legacyId }).from(users)).map((row) => row.v)),
    pets: nonNull((await db.select({ v: pets.legacyId }).from(pets)).map((row) => row.v)),
    needs: nonNull((await db.select({ v: needs.legacyId }).from(needs)).map((row) => row.v)),
    careRecords: nonNull((await db.select({ v: careRecords.legacyId }).from(careRecords)).map((row) => row.v)),
  },
  existingUserNames: new Set((await db.select({ v: users.userName }).from(users)).map((row) => row.v)),
  existingEmails: new Set((await db.select({ v: users.email }).from(users)).map((row) => row.v)),
};

const result = validateBundle(bundle, context);

if (!result.ok) {
  console.error(`Import aborted: ${result.errors.length} problem(s) found.`);
  for (const error of result.errors.slice(0, MAX_PRINTED_ERRORS)) {
    console.error(`  - ${error}`);
  }
  if (result.errors.length > MAX_PRINTED_ERRORS) {
    console.error(`  ...and ${result.errors.length - MAX_PRINTED_ERRORS} more`);
  }
  process.exit(1);
}

const summary = (rows: PreparedRows): [string, number][] => [
  ['users', rows.users.length],
  ['pets', rows.pets.length],
  ['pet_caretakers', rows.petCaretakers.length],
  ['needs', rows.needs.length],
  ['care_records', rows.careRecords.length],
];

if (dryRun) {
  console.log('Dry run: bundle is valid. Nothing was imported.');
  for (const [table, count] of summary(result.rows)) {
    console.log(`  ${table}: ${count} row(s) ready`);
  }
  process.exit(0);
}

function chunked<T>(rows: T[]): T[][] {
  const chunks: T[][] = [];
  for (let index = 0; index < rows.length; index += INSERT_CHUNK_SIZE) {
    chunks.push(rows.slice(index, index + INSERT_CHUNK_SIZE));
  }
  return chunks;
}

// Contract order: users -> pets -> caretakers -> needs -> records.
await withTransaction(async (tx) => {
  for (const chunk of chunked(result.rows.users)) {
    await tx.insert(users).values(chunk);
  }
  for (const chunk of chunked(result.rows.pets)) {
    await tx.insert(pets).values(chunk);
  }
  for (const chunk of chunked(result.rows.petCaretakers)) {
    await tx.insert(petCaretakers).values(chunk);
  }
  for (const chunk of chunked(result.rows.needs)) {
    await tx.insert(needs).values(chunk);
  }
  for (const chunk of chunked(result.rows.careRecords)) {
    await tx.insert(careRecords).values(chunk);
  }
});

console.log('Import complete.');
for (const [table, count] of summary(result.rows)) {
  console.log(`  ${table}: ${count} row(s) imported`);
}
