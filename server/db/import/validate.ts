import type { z } from 'zod';
import { getMeasurementType } from '../../../shared/utils/measurement';
import type { careRecords, needs, petCaretakers, pets, users } from '../schema';
import type {
  LegacyCareRecord,
  LegacyCaretaker,
  LegacyManifest,
  LegacyNeed,
  LegacyPet,
  LegacyUser,
} from './schemas';
import {
  legacyCareRecordSchema,
  legacyCaretakerSchema,
  legacyNeedSchema,
  legacyPetSchema,
  legacyUserSchema,
  manifestSchema,
} from './schemas';

/**
 * Pure bundle validation for the legacy import (docs/migration.md).
 * No db/h3 imports so unit tests can exercise it without Nitro. Collects EVERY
 * failure instead of stopping at the first; the import is all-or-nothing.
 */

type UserInsert = typeof users.$inferInsert;
type PetInsert = typeof pets.$inferInsert;
type CaretakerInsert = typeof petCaretakers.$inferInsert;
type NeedInsert = typeof needs.$inferInsert;
type CareRecordInsert = typeof careRecords.$inferInsert;

/** Collision data from the live database, injected by the CLI. */
export interface ImportContext {
  existingLegacyIds: {
    users: Set<string>;
    pets: Set<string>;
    needs: Set<string>;
    careRecords: Set<string>;
  };
  existingUserNames: Set<string>;
  existingEmails: Set<string>;
}

/** The six raw JSON values as read from the bundle files. */
export interface RawBundle {
  manifest: unknown;
  users: unknown;
  pets: unknown;
  petCaretakers: unknown;
  needs: unknown;
  careRecords: unknown;
}

export interface PreparedRows {
  users: UserInsert[];
  pets: PetInsert[];
  petCaretakers: CaretakerInsert[];
  needs: NeedInsert[];
  careRecords: CareRecordInsert[];
}

export type ValidationResult =
  | { ok: true; rows: PreparedRows }
  | { ok: false; errors: string[] };

function issueText(error: z.ZodError): string {
  return error.issues
    .map((issue) => (issue.path.length > 0 ? `${issue.path.join('.')}: ${issue.message}` : issue.message))
    .join('; ');
}

/** Parses one bundle file: must be an array, every row must match `schema`. */
function parseRows<Schema extends z.ZodType>(
  raw: unknown,
  schema: Schema,
  file: string,
  errors: string[],
): z.output<Schema>[] {
  if (!Array.isArray(raw)) {
    errors.push(`${file}: expected a JSON array`);
    return [];
  }
  const rows: z.output<Schema>[] = [];
  raw.forEach((row, index) => {
    const result = schema.safeParse(row);
    if (result.success) {
      rows.push(result.data);
    } else {
      errors.push(`${file}[${index}]: ${issueText(result.error)}`);
    }
  });
  return rows;
}

function checkDuplicates(
  values: (string | null | undefined)[],
  file: string,
  field: string,
  errors: string[],
): void {
  const seen = new Set<string>();
  for (const value of values) {
    if (!value) {
      continue;
    }
    if (seen.has(value)) {
      errors.push(`${file}: duplicate ${field} "${value}"`);
    }
    seen.add(value);
  }
}

/** Same shape as server/utils/mappers.toMeasurementColumns, duplicated here
 * to keep this module free of nitro-flavoured imports. */
function measurementColumns(shape: { duration?: { value: number; unit: string }; quantity?: { value: number; unit: string } }) {
  return {
    durationValue: shape.duration?.value ?? null,
    durationUnit: shape.duration?.unit ?? null,
    quantityValue: shape.quantity?.value ?? null,
    quantityUnit: shape.quantity?.unit ?? null,
  };
}

export function validateBundle(bundle: RawBundle, context: ImportContext): ValidationResult {
  const errors: string[] = [];

  const manifestResult = manifestSchema.safeParse(bundle.manifest);
  if (!manifestResult.success) {
    errors.push(`manifest.json: ${issueText(manifestResult.error)}`);
  }
  const manifest: LegacyManifest | null = manifestResult.success ? manifestResult.data : null;

  const legacyUsers = parseRows(bundle.users, legacyUserSchema, 'users.json', errors);
  const legacyPets = parseRows(bundle.pets, legacyPetSchema, 'pets.json', errors);
  const legacyCaretakers = parseRows(bundle.petCaretakers, legacyCaretakerSchema, 'pet_caretakers.json', errors);
  const legacyNeeds = parseRows(bundle.needs, legacyNeedSchema, 'needs.json', errors);
  const legacyRecords = parseRows(bundle.careRecords, legacyCareRecordSchema, 'care_records.json', errors);

  // Manifest counts are checked against the RAW file lengths so a row that
  // failed row-level parsing still counts (it already produced its own error).
  if (manifest) {
    const rawCounts: [keyof LegacyManifest['counts'], unknown][] = [
      ['users', bundle.users],
      ['pets', bundle.pets],
      ['petCaretakers', bundle.petCaretakers],
      ['needs', bundle.needs],
      ['careRecords', bundle.careRecords],
    ];
    for (const [key, raw] of rawCounts) {
      const actual = Array.isArray(raw) ? raw.length : 0;
      if (manifest.counts[key] !== actual) {
        errors.push(`manifest.json: counts.${key} is ${manifest.counts[key]} but the file has ${actual} rows`);
      }
    }
  }

  // --- users ----------------------------------------------------------------
  checkDuplicates(legacyUsers.map((user) => user.legacyId), 'users.json', 'legacyId', errors);
  checkDuplicates(legacyUsers.map((user) => user.userName), 'users.json', 'userName', errors);
  checkDuplicates(legacyUsers.map((user) => user.email), 'users.json', 'email', errors);
  for (const user of legacyUsers) {
    if (context.existingLegacyIds.users.has(user.legacyId)) {
      errors.push(`users.json: legacyId "${user.legacyId}" was already imported`);
    }
    if (context.existingUserNames.has(user.userName)) {
      errors.push(`users.json: userName "${user.userName}" already exists in the database`);
    }
    if (context.existingEmails.has(user.email)) {
      errors.push(`users.json: email "${user.email}" already exists in the database`);
    }
  }

  // --- pets -------------------------------------------------------------------
  const userIdByLegacy = new Map(legacyUsers.map((user) => [user.legacyId, crypto.randomUUID()]));
  checkDuplicates(legacyPets.map((pet) => pet.legacyId), 'pets.json', 'legacyId', errors);
  for (const pet of legacyPets) {
    if (context.existingLegacyIds.pets.has(pet.legacyId)) {
      errors.push(`pets.json: legacyId "${pet.legacyId}" was already imported`);
    }
    if (!userIdByLegacy.has(pet.ownerLegacyId)) {
      errors.push(`pets.json: pet "${pet.legacyId}" owner "${pet.ownerLegacyId}" not found in users.json`);
    }
  }

  // --- pet_caretakers ---------------------------------------------------------
  const petByLegacy = new Map(legacyPets.map((pet) => [pet.legacyId, pet]));
  const petIdByLegacy = new Map(legacyPets.map((pet) => [pet.legacyId, crypto.randomUUID()]));
  const caretakerPairs = new Set<string>();
  for (const link of legacyCaretakers) {
    const pet = petByLegacy.get(link.petLegacyId);
    if (!pet) {
      errors.push(`pet_caretakers.json: pet "${link.petLegacyId}" not found in pets.json`);
    }
    if (!userIdByLegacy.has(link.userLegacyId)) {
      errors.push(`pet_caretakers.json: user "${link.userLegacyId}" not found in users.json`);
    }
    if (pet && pet.ownerLegacyId === link.userLegacyId) {
      errors.push(`pet_caretakers.json: owner "${link.userLegacyId}" cannot be a caretaker of their own pet "${link.petLegacyId}"`);
    }
    const pairKey = `${link.petLegacyId}::${link.userLegacyId}`;
    if (caretakerPairs.has(pairKey)) {
      errors.push(`pet_caretakers.json: duplicate caretaker pair (${link.petLegacyId}, ${link.userLegacyId})`);
    }
    caretakerPairs.add(pairKey);
  }

  // --- needs --------------------------------------------------------------------
  const needByLegacy = new Map(legacyNeeds.map((need) => [need.legacyId, need]));
  const needIdByLegacy = new Map(legacyNeeds.map((need) => [need.legacyId, crypto.randomUUID()]));
  checkDuplicates(legacyNeeds.map((need) => need.legacyId), 'needs.json', 'legacyId', errors);
  for (const need of legacyNeeds) {
    if (context.existingLegacyIds.needs.has(need.legacyId)) {
      errors.push(`needs.json: legacyId "${need.legacyId}" was already imported`);
    }
    if (!petIdByLegacy.has(need.petLegacyId)) {
      errors.push(`needs.json: need "${need.legacyId}" pet "${need.petLegacyId}" not found in pets.json`);
    }
  }

  // --- care_records ---------------------------------------------------------------
  checkDuplicates(legacyRecords.map((record) => record.legacyId), 'care_records.json', 'legacyId', errors);
  for (const record of legacyRecords) {
    if (context.existingLegacyIds.careRecords.has(record.legacyId)) {
      errors.push(`care_records.json: legacyId "${record.legacyId}" was already imported`);
    }
    const need = needByLegacy.get(record.needLegacyId);
    if (!need) {
      errors.push(`care_records.json: record "${record.legacyId}" need "${record.needLegacyId}" not found in needs.json`);
    }
    if (!petIdByLegacy.has(record.petLegacyId)) {
      errors.push(`care_records.json: record "${record.legacyId}" pet "${record.petLegacyId}" not found in pets.json`);
    }
    if (need && need.petLegacyId !== record.petLegacyId) {
      errors.push(`care_records.json: record "${record.legacyId}" pet "${record.petLegacyId}" disagrees with its need's pet "${need.petLegacyId}"`);
    }
    if (need && getMeasurementType(need) !== getMeasurementType(record)) {
      errors.push(`care_records.json: record "${record.legacyId}" measurement type does not match need "${need.legacyId}"`);
    }
    // Strict contract reading: the exporter nulls references to deleted
    // accounts, so a dangling non-null reference is exporter breakage.
    if (record.careTakerLegacyId !== null && !userIdByLegacy.has(record.careTakerLegacyId)) {
      errors.push(`care_records.json: record "${record.legacyId}" careTaker "${record.careTakerLegacyId}" not found in users.json`);
    }
  }

  if (errors.length > 0) {
    return { ok: false, errors };
  }

  const linkCreatedAt = manifest!.exportedAt;
  return {
    ok: true,
    rows: {
      users: legacyUsers.map((user) => ({
        id: userIdByLegacy.get(user.legacyId)!,
        legacyId: user.legacyId,
        userName: user.userName,
        email: user.email,
        passwordHash: user.passwordHash,
        emailConfirmed: user.emailConfirmed,
        timezone: user.timezone,
        createdAt: user.createdAt,
        updatedAt: user.updatedAt,
      })),
      pets: legacyPets.map((pet) => ({
        id: petIdByLegacy.get(pet.legacyId)!,
        legacyId: pet.legacyId,
        ownerId: userIdByLegacy.get(pet.ownerLegacyId)!,
        name: pet.name,
        species: pet.species,
        breed: pet.breed,
        description: pet.description,
        birthday: pet.birthday,
        imageSource: pet.image.source,
        imageKey: pet.image.key,
        lastRolledNeedDate: pet.lastRolledNeedDate,
        createdAt: pet.createdAt,
        updatedAt: pet.updatedAt,
      })),
      petCaretakers: legacyCaretakers.map((link) => ({
        petId: petIdByLegacy.get(link.petLegacyId)!,
        userId: userIdByLegacy.get(link.userLegacyId)!,
        legacyPetId: link.petLegacyId,
        legacyUserId: link.userLegacyId,
        createdAt: linkCreatedAt,
      })),
      needs: legacyNeeds.map((need) => ({
        id: needIdByLegacy.get(need.legacyId)!,
        legacyId: need.legacyId,
        petId: petIdByLegacy.get(need.petLegacyId)!,
        dateFor: need.dateFor,
        category: need.category,
        description: need.description,
        ...measurementColumns(need),
        completed: need.completed,
        archived: need.archived,
        isActive: need.isActive,
        createdAt: need.createdAt,
        updatedAt: need.updatedAt,
      })),
      careRecords: legacyRecords.map((record) => ({
        id: crypto.randomUUID(),
        legacyId: record.legacyId,
        needId: needIdByLegacy.get(record.needLegacyId)!,
        petId: petIdByLegacy.get(record.petLegacyId)!,
        careTakerId: record.careTakerLegacyId === null ? null : userIdByLegacy.get(record.careTakerLegacyId)!,
        date: record.date,
        note: record.note,
        ...measurementColumns(record),
        timezone: record.timezone,
        createdAt: record.createdAt,
      })),
    },
  };
}
