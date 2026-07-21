import { z } from 'zod';
import { isValidDateOnly } from '../utils/date';
import { hasExactlyOneMeasurement } from '../utils/measurement';
import { MAX_INTERVAL_DAYS, MIN_INTERVAL_DAYS } from '../utils/recurrence';

/** Business rule shared by the API and the UI: at most this many non-archived
 * needs per pet per day. */
export const MAX_NEEDS_PER_DAY = 10;

/**
 * How the task repeats (ADR-0015). `once` creates a schedule-less instance
 * that archives at rollover and never returns; the other three become a
 * `need_schedules` rule. Weekdays are ISO numbers (1 = Mon … 7 = Sun).
 */
const dailyRuleSchema = z.object({ type: z.literal('daily') });
const intervalRuleSchema = z.object({
  type: z.literal('interval'),
  intervalDays: z
    .number({ error: 'validation.recurrenceIntervalRange' })
    .int('validation.recurrenceIntervalRange')
    .min(MIN_INTERVAL_DAYS, 'validation.recurrenceIntervalRange')
    .max(MAX_INTERVAL_DAYS, 'validation.recurrenceIntervalRange'),
});
const weeklyRuleSchema = z.object({
  type: z.literal('weekly'),
  weekdays: z
    .array(z.number().int().min(1).max(7), { error: 'validation.recurrenceWeekdaysEmpty' })
    .min(1, 'validation.recurrenceWeekdaysEmpty')
    .max(7, 'validation.recurrenceWeekdaysEmpty')
    .refine((days) => new Set(days).size === days.length, 'validation.recurrenceWeekdaysEmpty'),
});

/** A stored rule: what a `need_schedules` row can repeat as (no `once`). */
export const recurrenceRuleSchema = z.discriminatedUnion(
  'type',
  [dailyRuleSchema, intervalRuleSchema, weeklyRuleSchema],
  { error: 'validation.recurrenceInvalid' },
);

/** Create-time choice: a stored rule or a one-off (`once`) instance. */
export const recurrenceInputSchema = z.discriminatedUnion(
  'type',
  [z.object({ type: z.literal('once') }), dailyRuleSchema, intervalRuleSchema, weeklyRuleSchema],
  { error: 'validation.recurrenceInvalid' },
);

export type RecurrenceInput = z.infer<typeof recurrenceInputSchema>;

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
    // Default keeps the pre-0015 API contract: a plain create repeats daily.
    recurrence: recurrenceInputSchema.optional().default({ type: 'daily' }),
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
 * Sending both measurement types is still rejected. `recurrence` omitted
 * means "keep the current rule"; sending it reconciles the schedule (incl.
 * once <-> recurring conversions on the instance route).
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
    recurrence: recurrenceInputSchema.optional(),
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

/**
 * Rules-list edit (PUT /pets/:petId/schedules/:scheduleId): same carry-over
 * measurement contract as needUpdateSchema, but the recurrence must stay a
 * stored rule — a schedule cannot become a one-off.
 */
export const scheduleUpdateSchema = z
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
    recurrence: recurrenceRuleSchema.optional(),
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

export type ScheduleUpdateInput = z.infer<typeof scheduleUpdateSchema>;
