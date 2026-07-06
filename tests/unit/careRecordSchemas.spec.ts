import { describe, expect, it } from 'vitest';
import {
  careRecordSchema,
  careRecordUpdateSchema,
  timeOfDaySchema,
} from '../../shared/schemas/careRecord';

const quantity = { value: 100, unit: 'ml' as const };
const duration = { value: 15, unit: 'minutes' as const };

describe('timeOfDaySchema', () => {
  it.each(['00:00', '09:05', '14:30', '23:59'])('accepts %s', (time) => {
    expect(timeOfDaySchema.safeParse(time).success).toBe(true);
  });

  it.each(['24:00', '9:5', '12:60', '12.30', '1230', ''])('rejects %s', (time) => {
    expect(timeOfDaySchema.safeParse(time).success).toBe(false);
  });
});

describe('careRecordSchema', () => {
  it('accepts a quantity record with an optional time', () => {
    const result = careRecordSchema.safeParse({
      timezone: 'Europe/Helsinki',
      quantity,
      timeOfDay: '08:15',
    });
    expect(result.success).toBe(true);
  });

  it('accepts a record without timeOfDay (defaults to now server-side)', () => {
    expect(careRecordSchema.safeParse({ timezone: 'Europe/Helsinki', duration }).success).toBe(true);
  });

  it('rejects an invalid timeOfDay', () => {
    expect(
      careRecordSchema.safeParse({ timezone: 'Europe/Helsinki', quantity, timeOfDay: '25:00' })
        .success,
    ).toBe(false);
  });
});

describe('careRecordUpdateSchema', () => {
  it('accepts a full new state with one measurement', () => {
    const result = careRecordUpdateSchema.safeParse({ note: 'Fixed the amount', quantity });
    expect(result.success).toBe(true);
  });

  it('defaults the note to an empty string', () => {
    expect(careRecordUpdateSchema.parse({ duration }).note).toBe('');
  });

  it('rejects both measurements at once', () => {
    expect(careRecordUpdateSchema.safeParse({ quantity, duration }).success).toBe(false);
  });

  it('rejects a missing measurement', () => {
    expect(careRecordUpdateSchema.safeParse({ note: 'no amount' }).success).toBe(false);
  });

  it('has no timezone field (audit timezone is immutable)', () => {
    const parsed = careRecordUpdateSchema.parse({ quantity, timezone: 'Europe/Helsinki' });
    expect('timezone' in parsed).toBe(false);
  });

  it('rejects an over-long note', () => {
    expect(careRecordUpdateSchema.safeParse({ quantity, note: 'x'.repeat(301) }).success).toBe(false);
  });
});
