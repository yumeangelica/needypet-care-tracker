import { describe, expect, it } from 'vitest';
import { needSchema, needUpdateSchema } from '../../shared/schemas/need';

describe('needSchema', () => {
  it('accepts a valid duration need', () => {
    const result = needSchema.safeParse({
      dateFor: '2026-07-05',
      category: 'Evening walk',
      duration: { value: 30, unit: 'minutes' },
    });
    expect(result.success).toBe(true);
  });

  it('does not reject past dates itself (past-day rule is a server business rule)', () => {
    const result = needSchema.safeParse({
      dateFor: '2000-01-01',
      category: 'Evening walk',
      duration: { value: 30, unit: 'minutes' },
    });
    expect(result.success).toBe(true);
  });

  it('rejects a need without any measurement', () => {
    const result = needSchema.safeParse({
      dateFor: '2026-07-05',
      category: 'Evening walk',
    });
    expect(result.success).toBe(false);
  });

  it('accepts the quantity maximum and rejects larger values', () => {
    const base = { dateFor: '2026-07-05', category: 'Fresh water' };
    expect(
      needSchema.safeParse({ ...base, quantity: { value: 100_000, unit: 'ml' } }).success,
    ).toBe(true);
    expect(
      needSchema.safeParse({ ...base, quantity: { value: 100_001, unit: 'ml' } }).success,
    ).toBe(false);
  });
});

describe('needUpdateSchema', () => {
  const base = { category: 'Evening walk', description: 'Around the park.' };

  it('accepts an update with a single duration measurement', () => {
    const result = needUpdateSchema.safeParse({
      ...base,
      duration: { value: 45, unit: 'minutes' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an update with a single quantity measurement', () => {
    const result = needUpdateSchema.safeParse({
      ...base,
      quantity: { value: 150, unit: 'ml' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts an update without a measurement (server carries over the existing one)', () => {
    const result = needUpdateSchema.safeParse(base);
    expect(result.success).toBe(true);
  });

  it('rejects an update carrying both measurement types', () => {
    const result = needUpdateSchema.safeParse({
      ...base,
      duration: { value: 45, unit: 'minutes' },
      quantity: { value: 150, unit: 'ml' },
    });
    expect(result.success).toBe(false);
  });

  it('rejects a too-short category', () => {
    const result = needUpdateSchema.safeParse({ category: 'ab' });
    expect(result.success).toBe(false);
  });

  it('does not allow dateFor through (immutable after creation)', () => {
    const parsed = needUpdateSchema.parse({
      ...base,
      dateFor: '2030-01-01',
      duration: { value: 45, unit: 'minutes' },
    });
    expect(parsed).not.toHaveProperty('dateFor');
  });
});
