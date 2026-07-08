import { Database } from 'bun:sqlite';
import { eq } from 'drizzle-orm';
import { type BunSQLiteDatabase, drizzle } from 'drizzle-orm/bun-sqlite';
// The sqlite schema module is imported directly (not ./schema) so a
// NUXT_DB_URL inherited from the shell can't flip this process to pg.
import * as schema from '../../server/db/schema.sqlite';
import { hashToken } from '../../server/utils/tokens';

const { careRecords, needs, petCaretakers, pets, users } = schema;

/* ------------------------------------------------------------------ HTTP */

export interface ApiResponse<T = any> {
  status: number;
  body: T;
  headers: Headers;
}

/**
 * Random synthetic client IP. The rate limiter keys on x-forwarded-for, so
 * every request defaults to a fresh IP and per-IP limits never leak between
 * tests. 429 tests pass an explicit pinned `ip` instead.
 */
export function uniqueIp(): string {
  const octet = () => Math.floor(Math.random() * 254) + 1;
  return `10.${octet()}.${octet()}.${octet()}`;
}

let nameCounter = 0;

/** Unique username/email stem; random part keeps files (fresh workers) apart. */
export function uniqueName(prefix = 'user'): string {
  nameCounter += 1;
  return `${prefix}-${Math.random().toString(36).slice(2, 8)}-${nameCounter}`;
}

/** JSON request against the test server; 4xx/5xx come back as values. */
export async function api<T = any>(
  path: string,
  opts: {
    method?: string;
    body?: unknown;
    cookie?: string;
    ip?: string;
    headers?: Record<string, string>;
  } = {},
): Promise<ApiResponse<T>> {
  const res = await fetch(new URL(path, process.env.NUXT_TEST_URL), {
    method: opts.method ?? 'GET',
    headers: {
      'x-forwarded-for': opts.ip ?? uniqueIp(),
      ...(opts.body !== undefined ? { 'content-type': 'application/json' } : {}),
      ...(opts.cookie ? { cookie: opts.cookie } : {}),
      ...opts.headers,
    },
    body: opts.body !== undefined ? JSON.stringify(opts.body) : undefined,
    redirect: 'manual',
  });
  const text = await res.text();
  let body: any = null;
  try {
    body = text ? JSON.parse(text) : null;
  } catch {
    body = text;
  }
  return { status: res.status, body, headers: res.headers };
}

/** The session cookie pair(s) from a response, ready for a `cookie` header. */
export function sessionCookieFrom(res: ApiResponse): string {
  return res.headers
    .getSetCookie()
    .map((cookie) => cookie.split(';')[0]!)
    .join('; ');
}

/** H3 error payloads carry the app message in `data.message`. */
export function errorMessage(body: any): string {
  return body?.data?.message ?? body?.message ?? body?.statusMessage ?? '';
}

/** 422 validation payloads: `data.errorDetails` maps field -> messages. */
export function errorDetails(body: any): Record<string, string[]> | undefined {
  return body?.data?.errorDetails;
}

export async function loginAs(userName: string, password: string): Promise<string> {
  const res = await api('/api/auth/login', { method: 'POST', body: { userName, password } });
  if (res.status !== 200) {
    throw new Error(`test login failed for ${userName}: ${res.status} ${JSON.stringify(res.body)}`);
  }
  return sessionCookieFrom(res);
}

/* ---------------------------------------------------------------- DB side */

type TestDb = BunSQLiteDatabase<typeof schema>;

let dbHandle: TestDb | null = null;

/**
 * The suite's own connection to the server's SQLite file (WAL allows the
 * cross-process access) for seeding fixtures and asserting side effects.
 */
export function testDb(): TestDb {
  if (!dbHandle) {
    const file = process.env.NUXT_TEST_DB_FILE;
    if (!file) {
      throw new Error('NUXT_TEST_DB_FILE is not set - integration global setup did not run');
    }
    dbHandle = drizzle(new Database(file), { schema });
  }
  return dbHandle;
}

export interface TestUser {
  id: string;
  userName: string;
  email: string;
  password: string;
  timezone: string;
  locale: string;
}

export const TEST_PASSWORD = 'TestPaws123!';

export async function createUser(
  overrides: Partial<{
    userName: string;
    email: string;
    password: string;
    timezone: string;
    locale: string;
    emailConfirmed: boolean;
    digestOptIn: boolean;
    lastDigestDate: string | null;
  }> = {},
): Promise<TestUser> {
  const userName = overrides.userName ?? uniqueName('user');
  const email = (overrides.email ?? `${userName}@example.com`).toLowerCase();
  const password = overrides.password ?? TEST_PASSWORD;
  const timezone = overrides.timezone ?? 'Europe/Helsinki';
  const locale = overrides.locale ?? 'en';
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  await testDb().insert(users).values({
    id,
    // Low-cost bcrypt keeps fixture creation fast; verifyPassword accepts it, so
    // this also exercises the legacy-hash back-compat path against real logins.
    passwordHash: await Bun.password.hash(password, { algorithm: 'bcrypt', cost: 4 }),
    userName,
    email,
    emailConfirmed: overrides.emailConfirmed ?? true,
    timezone,
    locale,
    digestOptIn: overrides.digestOptIn ?? false,
    lastDigestDate: overrides.lastDigestDate ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return { id, userName, email, password, timezone, locale };
}

export async function createUserWithSession(
  overrides: Parameters<typeof createUser>[0] = {},
): Promise<TestUser & { cookie: string }> {
  const user = await createUser(overrides);
  const cookie = await loginAs(user.userName, user.password);
  return { ...user, cookie };
}

export async function createPet(
  ownerId: string,
  overrides: Partial<{ name: string; lastRolledNeedDate: string | null }> = {},
): Promise<{ id: string; name: string }> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const name = overrides.name ?? uniqueName('pet');
  await testDb().insert(pets).values({
    id,
    ownerId,
    name,
    species: 'Cat',
    breed: '',
    description: '',
    imageSource: 'preset',
    imageKey: 'cat',
    lastRolledNeedDate: overrides.lastRolledNeedDate ?? null,
    createdAt: now,
    updatedAt: now,
  });
  return { id, name };
}

export async function addCaretaker(petId: string, userId: string): Promise<void> {
  await testDb()
    .insert(petCaretakers)
    .values({ petId, userId, createdAt: new Date().toISOString() });
}

export interface Measurement {
  value: number;
  unit: string;
}

export async function createNeed(
  petId: string,
  overrides: {
    dateFor: string;
    category?: string;
    description?: string;
    duration?: Measurement;
    quantity?: Measurement;
    completed?: boolean;
    archived?: boolean;
    isActive?: boolean;
  },
): Promise<{ id: string }> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const measurement = overrides.duration
    ? { durationValue: overrides.duration.value, durationUnit: overrides.duration.unit }
    : { quantityValue: (overrides.quantity ?? { value: 200, unit: 'ml' }).value, quantityUnit: (overrides.quantity ?? { value: 200, unit: 'ml' }).unit };
  await testDb().insert(needs).values({
    id,
    petId,
    dateFor: overrides.dateFor,
    category: overrides.category ?? 'Fresh water',
    description: overrides.description ?? '',
    ...measurement,
    completed: overrides.completed ?? false,
    archived: overrides.archived ?? false,
    isActive: overrides.isActive ?? true,
    createdAt: now,
    updatedAt: now,
  });
  return { id };
}

export async function createRecord(opts: {
  needId: string;
  petId: string;
  careTakerId: string | null;
  duration?: Measurement;
  quantity?: Measurement;
  date?: string;
  note?: string;
}): Promise<{ id: string }> {
  const now = new Date().toISOString();
  const id = crypto.randomUUID();
  const measurement = opts.duration
    ? { durationValue: opts.duration.value, durationUnit: opts.duration.unit }
    : { quantityValue: (opts.quantity ?? { value: 100, unit: 'ml' }).value, quantityUnit: (opts.quantity ?? { value: 100, unit: 'ml' }).unit };
  await testDb().insert(careRecords).values({
    id,
    needId: opts.needId,
    petId: opts.petId,
    careTakerId: opts.careTakerId,
    date: opts.date ?? now,
    note: opts.note ?? '',
    ...measurement,
    timezone: 'Europe/Helsinki',
    createdAt: now,
  });
  return { id };
}

export async function getUserRow(id: string) {
  const rows = await testDb().select().from(users).where(eq(users.id, id));
  return rows[0];
}

export async function getPetRow(id: string) {
  const rows = await testDb().select().from(pets).where(eq(pets.id, id));
  return rows[0];
}

export async function getNeedRow(id: string) {
  const rows = await testDb().select().from(needs).where(eq(needs.id, id));
  return rows[0];
}

export async function getNeedRows(petId: string) {
  return testDb().select().from(needs).where(eq(needs.petId, petId));
}

export async function getRecordRows(needId: string) {
  return testDb().select().from(careRecords).where(eq(careRecords.needId, needId));
}

/* --------------------------------------------------------------- tokens */

const HOUR_MS = 60 * 60_000;

/**
 * Tokens are stored hashed and the raw value only ever rides in the email,
 * so tests plant a known raw token directly on the row and then drive the
 * public endpoint with it — the real hash+expiry lookup path stays exercised.
 */
export async function plantEmailConfirmToken(
  userId: string,
  rawToken: string,
  expiresAt = new Date(Date.now() + HOUR_MS).toISOString(),
): Promise<void> {
  await testDb()
    .update(users)
    .set({ emailConfirmToken: hashToken(rawToken), emailConfirmExpiresAt: expiresAt })
    .where(eq(users.id, userId));
}

export async function plantPasswordResetToken(
  userId: string,
  rawToken: string,
  expiresAt = new Date(Date.now() + HOUR_MS).toISOString(),
): Promise<void> {
  await testDb()
    .update(users)
    .set({ passwordResetToken: hashToken(rawToken), passwordResetExpiresAt: expiresAt })
    .where(eq(users.id, userId));
}
