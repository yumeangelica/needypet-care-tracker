import { describe, expect, it } from 'vitest';
import {
  getMeasurementType,
  getMeasurementValue,
  hasExactlyOneMeasurement,
  isNeedSatisfied,
  measurementTypesMatch,
  needTemplateKey,
} from '../../shared/utils/measurement';

const walk = { duration: { value: 30, unit: 'minutes' as const } };
const water = { quantity: { value: 200, unit: 'ml' as const } };

describe('getMeasurementType / hasExactlyOneMeasurement', () => {
  it('identifies the single measurement', () => {
    expect(getMeasurementType(walk)).toBe('duration');
    expect(getMeasurementType(water)).toBe('quantity');
    expect(hasExactlyOneMeasurement(walk)).toBe(true);
    expect(hasExactlyOneMeasurement(water)).toBe(true);
  });

  it('rejects none or both (exactly-one invariant)', () => {
    expect(getMeasurementType({})).toBeNull();
    expect(getMeasurementType({ ...walk, ...water })).toBeNull();
    expect(hasExactlyOneMeasurement({})).toBe(false);
    expect(hasExactlyOneMeasurement({ ...walk, ...water })).toBe(false);
    expect(hasExactlyOneMeasurement({ duration: null, quantity: null })).toBe(false);
  });
});

describe('measurementTypesMatch', () => {
  it('matches records to their parent need shape', () => {
    expect(measurementTypesMatch(walk, { duration: { value: 10, unit: 'minutes' } })).toBe(true);
    expect(measurementTypesMatch(water, { quantity: { value: 50, unit: 'ml' } })).toBe(true);
  });

  it('rejects cross-shape and invalid records', () => {
    expect(measurementTypesMatch(walk, water)).toBe(false);
    expect(measurementTypesMatch(water, walk)).toBe(false);
    expect(measurementTypesMatch(walk, {})).toBe(false);
    expect(measurementTypesMatch({}, walk)).toBe(false);
  });
});

describe('isNeedSatisfied', () => {
  it('completes when summed record values reach the need value', () => {
    expect(isNeedSatisfied(water, [{ quantity: { value: 200, unit: 'ml' } }])).toBe(true);
    expect(
      isNeedSatisfied(water, [
        { quantity: { value: 120, unit: 'ml' } },
        { quantity: { value: 80, unit: 'ml' } },
      ]),
    ).toBe(true);
    expect(isNeedSatisfied(water, [{ quantity: { value: 250, unit: 'ml' } }])).toBe(true);
  });

  it('stays open when the sum falls short', () => {
    expect(isNeedSatisfied(water, [{ quantity: { value: 199, unit: 'ml' } }])).toBe(false);
    expect(isNeedSatisfied(walk, [{ duration: { value: 29, unit: 'minutes' } }])).toBe(false);
    expect(isNeedSatisfied(walk, [])).toBe(false);
  });

  it('treats records without a value as zero (old backend behavior)', () => {
    expect(isNeedSatisfied(water, [{}, { quantity: { value: 200, unit: 'ml' } }])).toBe(true);
    expect(isNeedSatisfied(water, [{}])).toBe(false);
  });

  it('never satisfies an invalid need shape', () => {
    expect(isNeedSatisfied({}, [{ quantity: { value: 999, unit: 'ml' } }])).toBe(false);
  });
});

describe('needTemplateKey (rollover de-duplication)', () => {
  const need = { category: 'Evening walk', description: 'Around the park', ...walk };

  it('is stable for identical templates', () => {
    const copy = { category: 'Evening walk', description: 'Around the park', ...walk };
    expect(needTemplateKey(copy)).toBe(needTemplateKey(need));
  });

  it('differs when category, description or measurement differ', () => {
    expect(needTemplateKey({ ...need, category: 'Morning walk' })).not.toBe(needTemplateKey(need));
    expect(needTemplateKey({ ...need, description: 'Short loop' })).not.toBe(needTemplateKey(need));
    expect(
      needTemplateKey({ ...need, duration: { value: 45, unit: 'minutes' } }),
    ).not.toBe(needTemplateKey(need));
    expect(
      needTemplateKey({
        category: need.category,
        description: need.description,
        quantity: { value: 30, unit: 'ml' },
      }),
    ).not.toBe(needTemplateKey(need));
  });
});
