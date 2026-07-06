import { z } from 'zod';
import { durationMeasurementSchema, quantityMeasurementSchema } from '../../../shared/schemas/need';
import { isSupportedTimeZone, isValidDateOnly, isValidIsoTimestamp } from '../../../shared/utils/date';
import { hasExactlyOneMeasurement } from '../../../shared/utils/measurement';

/**
 * Zod shapes for the legacy JSON export bundle (documentation/migration.md).
 * Structural, per-row validation only; cross-file referential checks live in
 * validate.ts. Relative imports keep this module loadable in plain node
 * (vitest, CLI) without Nuxt aliases.
 */

const legacyIdSchema = z.string().min(1, 'legacyId must not be empty');

const dateOnlySchema = z
  .string()
  .refine(isValidDateOnly, { message: 'Invalid date-only value (expected YYYY-MM-DD)' });

const isoTimestampSchema = z
  .string()
  .refine(isValidIsoTimestamp, { message: 'Invalid UTC ISO timestamp' });

const legacyTimezoneSchema = z
  .string()
  .refine(isSupportedTimeZone, { message: 'Unsupported IANA timezone' });

const exactlyOneMeasurement = (
  record: { duration?: unknown; quantity?: unknown },
  ctx: z.RefinementCtx,
): void => {
  if (!hasExactlyOneMeasurement(record as Parameters<typeof hasExactlyOneMeasurement>[0])) {
    ctx.addIssue({
      code: 'custom',
      message: 'Exactly one measurement (duration or quantity) is required',
      path: ['quantity'],
    });
  }
};

export const manifestSchema = z.object({
  formatVersion: z.literal(1),
  exportedAt: isoTimestampSchema,
  source: z.string().min(1),
  counts: z.object({
    users: z.number().int().nonnegative(),
    pets: z.number().int().nonnegative(),
    petCaretakers: z.number().int().nonnegative(),
    needs: z.number().int().nonnegative(),
    careRecords: z.number().int().nonnegative(),
  }),
});

export const legacyUserSchema = z.object({
  legacyId: legacyIdSchema,
  userName: z.string().min(1),
  email: z
    .email('Invalid email')
    .transform((value) => value.toLowerCase()),
  passwordHash: z.string().min(1),
  emailConfirmed: z.boolean(),
  timezone: legacyTimezoneSchema,
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export const legacyPetSchema = z.object({
  legacyId: legacyIdSchema,
  ownerLegacyId: legacyIdSchema,
  name: z.string().min(1),
  species: z.string().nullable().optional().default(null),
  breed: z.string().nullable().optional().default(null),
  description: z.string().nullable().optional().default(null),
  birthday: dateOnlySchema.nullable(),
  image: z.object({
    source: z.literal('preset'),
    key: z.enum(['dog', 'cat', 'bunny']),
  }),
  lastRolledNeedDate: dateOnlySchema.nullable(),
  createdAt: isoTimestampSchema,
  updatedAt: isoTimestampSchema,
});

export const legacyCaretakerSchema = z.object({
  petLegacyId: legacyIdSchema,
  userLegacyId: legacyIdSchema,
});

export const legacyNeedSchema = z
  .object({
    legacyId: legacyIdSchema,
    petLegacyId: legacyIdSchema,
    dateFor: dateOnlySchema,
    category: z.string().min(1),
    description: z.string().optional().default(''),
    duration: durationMeasurementSchema.optional(),
    quantity: quantityMeasurementSchema.optional(),
    completed: z.boolean(),
    archived: z.boolean(),
    isActive: z.boolean(),
    createdAt: isoTimestampSchema,
    updatedAt: isoTimestampSchema,
  })
  .superRefine(exactlyOneMeasurement);

export const legacyCareRecordSchema = z
  .object({
    legacyId: legacyIdSchema,
    needLegacyId: legacyIdSchema,
    petLegacyId: legacyIdSchema,
    careTakerLegacyId: legacyIdSchema.nullable(),
    date: isoTimestampSchema,
    note: z.string().nullable().optional().default(''),
    duration: durationMeasurementSchema.optional(),
    quantity: quantityMeasurementSchema.optional(),
    timezone: legacyTimezoneSchema,
    createdAt: isoTimestampSchema,
  })
  .superRefine(exactlyOneMeasurement);

export type LegacyManifest = z.output<typeof manifestSchema>;
export type LegacyUser = z.output<typeof legacyUserSchema>;
export type LegacyPet = z.output<typeof legacyPetSchema>;
export type LegacyCaretaker = z.output<typeof legacyCaretakerSchema>;
export type LegacyNeed = z.output<typeof legacyNeedSchema>;
export type LegacyCareRecord = z.output<typeof legacyCareRecordSchema>;
