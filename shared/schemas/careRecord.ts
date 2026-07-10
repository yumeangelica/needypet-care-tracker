import { z } from 'zod';
import { hasExactlyOneMeasurement } from '../utils/measurement';
import { durationMeasurementSchema, quantityMeasurementSchema } from './need';
import { timezoneSchema } from './user';

/** Optional wall-clock time in the OWNER's timezone; defaults to "now". */
export const timeOfDaySchema = z
  .string()
  .regex(/^([01]\d|2[0-3]):[0-5]\d$/, 'validation.timeFormat');

export const careRecordSchema = z
  .object({
    note: z.string().max(300, 'validation.noteMax').optional().default(''),
    timezone: timezoneSchema,
    quantity: quantityMeasurementSchema.optional(),
    duration: durationMeasurementSchema.optional(),
    timeOfDay: timeOfDaySchema.optional(),
  })
  .superRefine((record, ctx) => {
    if (!hasExactlyOneMeasurement(record)) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.recordMeasurement',
        path: ['quantity'],
      });
    }
  });

/**
 * Full new state of an edited record: exactly one measurement, optional note
 * and time correction. No timezone — the original actor's audit timezone is
 * immutable, as are attribution and creation time.
 */
export const careRecordUpdateSchema = z
  .object({
    note: z.string().max(300, 'validation.noteMax').optional().default(''),
    quantity: quantityMeasurementSchema.optional(),
    duration: durationMeasurementSchema.optional(),
    timeOfDay: timeOfDaySchema.optional(),
  })
  .superRefine((record, ctx) => {
    if (!hasExactlyOneMeasurement(record)) {
      ctx.addIssue({
        code: 'custom',
        message: 'validation.recordMeasurement',
        path: ['quantity'],
      });
    }
  });

export type CareRecordInput = z.infer<typeof careRecordSchema>;
export type CareRecordUpdateInput = z.infer<typeof careRecordUpdateSchema>;
