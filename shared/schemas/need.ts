import { z } from 'zod';
import { isValidDateOnly } from '../utils/date';
import { hasExactlyOneMeasurement } from '../utils/measurement';

/** Business rule shared by the API and the UI: at most this many non-archived
 * needs per pet per day. */
export const MAX_NEEDS_PER_DAY = 10;

/** Measurement schemas shared by needs and care records (old messages kept). */
export const quantityMeasurementSchema = z.object({
  value: z
    .number({ error: 'validation.quantityNumber' })
    .min(1, 'validation.quantityMin')
    .max(100_000, 'validation.quantityMax'),
  unit: z.enum(['ml', 'g'], { error: 'validation.quantityUnit' }),
});

export const durationMeasurementSchema = z.object({
  value: z
    .number({ error: 'validation.durationNumber' })
    .min(1, 'validation.durationMin')
    .max(1440, 'validation.durationMax'),
  unit: z.enum(['minutes'], { error: 'validation.durationUnit' }),
});

export const needSchema = z
  .object({
    dateFor: z.string().refine(isValidDateOnly, { message: 'validation.needDateInvalid' }),
    category: z
      .string()
      .min(3, 'validation.categoryMin')
      .max(50, 'validation.categoryMax'),
    description: z
      .string()
      .max(1000, 'validation.needDescriptionMax')
      .optional()
      .default(''),
    quantity: quantityMeasurementSchema.optional(),
    duration: durationMeasurementSchema.optional(),
  })
  .superRefine((need, ctx) => {
    if (!hasExactlyOneMeasurement(need)) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.needMeasurement',
        path: ['quantity'],
      });
    }
  });

export type NeedInput = z.infer<typeof needSchema>;

/**
 * Update payload: dateFor is immutable, and the measurement may be omitted
 * entirely — the server then carries over the need's existing measurement.
 * Sending both measurement types is still rejected.
 */
export const needUpdateSchema = z
  .object({
    category: z
      .string()
      .min(3, 'validation.categoryMin')
      .max(50, 'validation.categoryMax'),
    description: z
      .string()
      .max(1000, 'validation.needDescriptionMax')
      .optional()
      .default(''),
    quantity: quantityMeasurementSchema.optional(),
    duration: durationMeasurementSchema.optional(),
  })
  .superRefine((need, ctx) => {
    if (need.quantity && need.duration) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.needMeasurement',
        path: ['quantity'],
      });
    }
  });

export type NeedUpdateInput = z.infer<typeof needUpdateSchema>;
