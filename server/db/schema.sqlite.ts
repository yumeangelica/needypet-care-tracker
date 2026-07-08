import { sql } from 'drizzle-orm';
import { check, index, integer, primaryKey, real, sqliteTable, text } from 'drizzle-orm/sqlite-core';

/**
 * SQLite schema written with Postgres-portable conventions so the production
 * pg schema is a mechanical transcription:
 * - TEXT UUID primary keys (crypto.randomUUID())
 * - date-only values as TEXT 'YYYY-MM-DD' (string-compared, both dialects)
 * - timestamps as TEXT ISO-8601 UTC
 * - integer({ mode: 'boolean' }) -> pg boolean
 * Every table keeps a nullable legacy_id for future Mongo import traceability.
 */

export const users = sqliteTable('users', {
  id: text('id').primaryKey(),
  legacyId: text('legacy_id').unique(),
  userName: text('user_name').notNull().unique(),
  email: text('email').notNull().unique(),
  passwordHash: text('password_hash').notNull(),
  emailConfirmed: integer('email_confirmed', { mode: 'boolean' }).notNull().default(false),
  emailConfirmToken: text('email_confirm_token'),
  emailConfirmExpiresAt: text('email_confirm_expires_at'),
  passwordResetToken: text('password_reset_token'),
  passwordResetExpiresAt: text('password_reset_expires_at'),
  timezone: text('timezone').notNull(),
  locale: text('locale').notNull().default('en'), // UI language: 'en' (default) or 'fi'
  digestOptIn: integer('digest_opt_in', { mode: 'boolean' }).notNull().default(false),
  lastDigestDate: text('last_digest_date'), // YYYY-MM-DD user-local, stamped on a sent digest
  createdAt: text('created_at').notNull(),
  updatedAt: text('updated_at').notNull(),
});

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

export const needs = sqliteTable(
  'needs',
  {
    id: text('id').primaryKey(),
    legacyId: text('legacy_id').unique(),
    petId: text('pet_id')
      .notNull()
      .references(() => pets.id, { onDelete: 'cascade' }),
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
