import { z } from 'zod';
import { isValidDateOnly } from '../utils/date';
import { hasExactlyOneMeasurement } from '../utils/measurement';

/** Business rule shared by the API and the UI: at most this many non-archived
 * needs per pet per day. */
export const MAX_NEEDS_PER_DAY = 10;

/** Measurement schemas shared by needs and care records (old messages kept). */
export const quantityMeasurementSchema = z.object({
  value: z
    .number({ error: 'Quantity value must be a number' })
    .min(1, 'Quantity must be at least 1'),
  unit: z.enum(['ml', 'g'], { error: 'Quantity unit must be ml or g' }),
});

export const durationMeasurementSchema = z.object({
  value: z
    .number({ error: 'Duration value must be a number' })
    .min(1, 'Duration must be at least 1 minute')
    .max(1440, 'Duration cannot be over 1440 minutes'),
  unit: z.enum(['minutes'], { error: 'Duration unit must be minutes' }),
});

export const needSchema = z
  .object({
    dateFor: z.string().refine(isValidDateOnly, { message: 'A valid date is required' }),
    category: z
      .string()
      .min(3, 'Category must be at least 3 characters')
      .max(50, 'Category must be at most 50 characters'),
    description: z
      .string()
      .max(1000, 'Description must be at most 1000 characters')
      .optional()
      .default(''),
    quantity: quantityMeasurementSchema.optional(),
    duration: durationMeasurementSchema.optional(),
  })
  .superRefine((need, ctx) => {
    if (!hasExactlyOneMeasurement(need)) {
      ctx.addIssue({
        code: 'custom',
        message: 'Need must have exactly one measurement type',
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
      .min(3, 'Category must be at least 3 characters')
      .max(50, 'Category must be at most 50 characters'),
    description: z
      .string()
      .max(1000, 'Description must be at most 1000 characters')
      .optional()
      .default(''),
    quantity: quantityMeasurementSchema.optional(),
    duration: durationMeasurementSchema.optional(),
  })
  .superRefine((need, ctx) => {
    if (need.quantity && need.duration) {
      ctx.addIssue({
        code: 'custom',
        message: 'Need must have exactly one measurement type',
        path: ['quantity'],
      });
    }
  });

export type NeedUpdateInput = z.infer<typeof needUpdateSchema>;
