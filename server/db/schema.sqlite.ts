import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, real, sqliteTable, text, uniqueIndex } from 'drizzle-orm/sqlite-core';

/**
 * The single database schema (dev bun:sqlite, prod libSQL/Turso — same dialect).
 * Portable conventions kept so any SQLite host behaves identically:
 * - TEXT UUID primary keys (crypto.randomUUID())
 * - date-only values as TEXT 'YYYY-MM-DD' (string-compared)
 * - timestamps as TEXT ISO-8601 UTC
 *   (both parsed to Temporal in shared/utils/{date,datetime}.ts, never stored as Temporal)
 * - integer({ mode: 'boolean' }) for boolean columns
 * Every domain table keeps a nullable legacy_id for future Mongo import traceability.
 */

export const users = sqliteTable(
  'users',
  {
    id: text('id').primaryKey(),
    legacyId: text('legacy_id').unique(),
    userName: text('user_name').notNull().unique(),
    userNameKey: text('user_name_key').notNull(),
    email: text('email').notNull().unique(),
    passwordHash: text('password_hash').notNull(),
    emailConfirmed: integer('email_confirmed', { mode: 'boolean' }).notNull().default(false),
    emailConfirmToken: text('email_confirm_token'),
    emailConfirmExpiresAt: text('email_confirm_expires_at'),
    passwordResetToken: text('password_reset_token'),
    passwordResetExpiresAt: text('password_reset_expires_at'),
    // Bumped on password reset/change; requireAppUser rejects session cookies
    // carrying an older value, so stateless sessions become revocable.
    sessionVersion: integer('session_version').notNull().default(0),
    timezone: text('timezone').notNull(),
    locale: text('locale').notNull().default('en'), // UI language: 'en' (default) or 'fi'
    digestOptIn: integer('digest_opt_in', { mode: 'boolean' }).notNull().default(false),
    lastDigestDate: text('last_digest_date'), // YYYY-MM-DD user-local, stamped on a sent digest
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    // NFKC + Unicode-lower key shared by login, uniqueness, caretaker add and
    // legacy import. Stored display casing stays untouched.
    uniqueIndex('users_user_name_key_idx').on(table.userNameKey),
  ],
);

/** Shared fixed-window counters for abuse-sensitive endpoints. */
export const rateLimits = sqliteTable(
  'rate_limits',
  {
    key: text('key').primaryKey(),
    count: integer('count').notNull(),
    resetAt: text('reset_at').notNull(),
  },
  (table) => [index('rate_limits_reset_at_idx').on(table.resetAt)],
);

export const pets = sqliteTable(
  'pets',
  {
    id: text('id').primaryKey(),
    legacyId: text('legacy_id').unique(),
    ownerId: text('owner_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    name: text('name').notNull(),
    species: text('species'),
    breed: text('breed'),
    description: text('description'),
    birthday: text('birthday'), // YYYY-MM-DD | null, never future (owner-local)
    imageSource: text('image_source').notNull().default('preset'),
    imageKey: text('image_key').default('cat'),
    imageUrl: text('image_url'), // upload metadata, later
    imageStorageKey: text('image_storage_key'), // upload metadata, later
    lastRolledNeedDate: text('last_rolled_need_date'), // YYYY-MM-DD rollover guard
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [index('pets_owner_idx').on(table.ownerId)],
);

export const petCaretakers = sqliteTable(
  'pet_caretakers',
  {
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    userId: text('user_id')
      .notNull()
      .references(() => users.id, { onDelete: 'cascade' }),
    legacyPetId: text('legacy_pet_id'),
    legacyUserId: text('legacy_user_id'),
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    primaryKey({ columns: [table.petId, table.userId] }),
    index('pet_caretakers_user_idx').on(table.userId),
  ],
);

/**
 * Recurrence rules (ADR-0015): the template a need instance is created from.
 * `needs` stays the per-day instance table; rollover materializes one
 * instance per due, active schedule. Measurement columns and CHECKs mirror
 * `needs` (ADR-0014). A paused schedule (is_active = false) produces no
 * instances but survives until deleted.
 */
export const needSchedules = sqliteTable(
  'need_schedules',
  {
    id: text('id').primaryKey(),
    legacyId: text('legacy_id').unique(),
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    category: text('category').notNull(),
    description: text('description').notNull().default(''),
    durationValue: integer('duration_value'),
    durationUnit: text('duration_unit'),
    quantityValue: real('quantity_value'),
    quantityUnit: text('quantity_unit'),
    // 'daily' | 'interval' (every intervalDays) | 'weekly' (weekdays CSV).
    recurrenceType: text('recurrence_type').notNull().default('daily'),
    intervalDays: integer('interval_days'), // interval only, 2..365
    weekdays: text('weekdays'), // weekly only, CSV of ISO weekday numbers "1,4" (1 = Mon)
    anchorDate: text('anchor_date').notNull(), // YYYY-MM-DD owner-local; fixed interval rhythm zero
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('need_schedules_pet_idx').on(table.petId),
    index('need_schedules_pet_active_idx').on(table.petId, table.isActive),
    check(
      'need_schedules_exactly_one_measurement',
      sql`(${table.durationValue} IS NOT NULL) + (${table.quantityValue} IS NOT NULL) = 1`,
    ),
    check(
      'need_schedules_duration_unit',
      sql`${table.durationUnit} IS NULL OR ${table.durationUnit} = 'minutes'`,
    ),
    check(
      'need_schedules_quantity_unit',
      sql`${table.quantityUnit} IS NULL OR ${table.quantityUnit} IN ('ml', 'g')`,
    ),
    check(
      'need_schedules_recurrence_type',
      sql`${table.recurrenceType} IN ('daily', 'interval', 'weekly')`,
    ),
  ],
);

export const needs = sqliteTable(
  'needs',
  {
    id: text('id').primaryKey(),
    legacyId: text('legacy_id').unique(),
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    // The schedule this instance was materialized from; NULL for one-off
    // needs and for frozen history whose rule was deleted (SET NULL keeps
    // archived days untouched — ADR-0015).
    scheduleId: text('schedule_id').references(() => needSchedules.id, { onDelete: 'set null' }),
    dateFor: text('date_for').notNull(), // YYYY-MM-DD, owner-local care day
    category: text('category').notNull(),
    description: text('description').notNull().default(''),
    durationValue: integer('duration_value'),
    durationUnit: text('duration_unit'),
    quantityValue: real('quantity_value'),
    quantityUnit: text('quantity_unit'),
    completed: integer('completed', { mode: 'boolean' }).notNull().default(false),
    archived: integer('archived', { mode: 'boolean' }).notNull().default(false),
    isActive: integer('is_active', { mode: 'boolean' }).notNull().default(true),
    createdAt: text('created_at').notNull(),
    updatedAt: text('updated_at').notNull(),
  },
  (table) => [
    index('needs_pet_date_idx').on(table.petId, table.dateFor),
    index('needs_pet_archived_idx').on(table.petId, table.archived),
    // Rollover dedup: "does today already have a live instance of this rule?"
    index('needs_schedule_date_idx').on(table.scheduleId, table.dateFor),
    check(
      'needs_exactly_one_measurement',
      sql`(${table.durationValue} IS NOT NULL) + (${table.quantityValue} IS NOT NULL) = 1`,
    ),
    check('needs_duration_unit', sql`${table.durationUnit} IS NULL OR ${table.durationUnit} = 'minutes'`),
    check(
      'needs_quantity_unit',
      sql`${table.quantityUnit} IS NULL OR ${table.quantityUnit} IN ('ml', 'g')`,
    ),
  ],
);

export const careRecords = sqliteTable(
  'care_records',
  {
    id: text('id').primaryKey(),
    legacyId: text('legacy_id').unique(),
    needId: text('need_id')
      .notNull()
      .references(() => needs.id, { onDelete: 'cascade' }),
    // Denormalized so history stays queryable per pet without joining needs.
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
    // SET NULL keeps the audit row when a caretaker deletes their account.
    careTakerId: text('care_taker_id').references(() => users.id, { onDelete: 'set null' }),
    date: text('date').notNull(), // full UTC ISO timestamp
    note: text('note'),
    durationValue: integer('duration_value'),
    durationUnit: text('duration_unit'),
    quantityValue: real('quantity_value'),
    quantityUnit: text('quantity_unit'),
    timezone: text('timezone').notNull(), // acting user's IANA tz (audit)
    createdAt: text('created_at').notNull(),
  },
  (table) => [
    index('care_records_need_idx').on(table.needId),
    // The diary, stats week window and streak all filter by pet and order/range
    // on date — the reason petId is denormalized here in the first place.
    index('care_records_pet_date_idx').on(table.petId, table.date),
    check(
      'care_records_exactly_one_measurement',
      sql`(${table.durationValue} IS NOT NULL) + (${table.quantityValue} IS NOT NULL) = 1`,
    ),
    check(
      'care_records_duration_unit',
      sql`${table.durationUnit} IS NULL OR ${table.durationUnit} = 'minutes'`,
    ),
    check(
      'care_records_quantity_unit',
      sql`${table.quantityUnit} IS NULL OR ${table.quantityUnit} IN ('ml', 'g')`,
    ),
  ],
);
