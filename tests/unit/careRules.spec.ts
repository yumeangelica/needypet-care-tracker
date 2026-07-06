import { describe, expect, it } from 'vitest';
import {
  canMutateRecord,
  validateRecordAgainstNeed,
  validateRecordMutation,
} from '../../shared/utils/careRules';

const TODAY = '2026-07-05';

const walkNeed = {
  completed: false,
  archived: false,
  dateFor: TODAY,
  duration: { value: 30, unit: 'minutes' as const },
};

const walkRecord = { duration: { value: 30, unit: 'minutes' as const } };
const waterRecord = { quantity: { value: 200, unit: 'ml' as const } };

describe('validateRecordAgainstNeed', () => {
  it('accepts a matching record on the owner-current day', () => {
    expect(validateRecordAgainstNeed(walkNeed, walkRecord, TODAY)).toBeNull();
  });

  it('rejects a completed need', () => {
    expect(validateRecordAgainstNeed({ ...walkNeed, completed: true }, walkRecord, TODAY)).toBe(
      'completed',
    );
  });

  it('rejects an archived need', () => {
    expect(validateRecordAgainstNeed({ ...walkNeed, archived: true }, walkRecord, TODAY)).toBe(
      'archived',
    );
  });

  it('rejects a measurement type mismatch', () => {
    expect(validateRecordAgainstNeed(walkNeed, waterRecord, TODAY)).toBe('measurement-mismatch');
  });

  it('rejects a record for a past day', () => {
    expect(validateRecordAgainstNeed({ ...walkNeed, dateFor: '2026-07-04' }, walkRecord, TODAY)).toBe(
      'not-today',
    );
  });

  it('rejects a record for a future day', () => {
    expect(validateRecordAgainstNeed({ ...walkNeed, dateFor: '2026-07-06' }, walkRecord, TODAY)).toBe(
      'not-today',
    );
  });

  it('checks completed before archived (legacy ordering)', () => {
    expect(
      validateRecordAgainstNeed({ ...walkNeed, completed: true, archived: true }, walkRecord, TODAY),
    ).toBe('completed');
  });

  it('checks measurement type before the care day', () => {
    expect(
      validateRecordAgainstNeed({ ...walkNeed, dateFor: '2026-07-04' }, waterRecord, TODAY),
    ).toBe('measurement-mismatch');
  });
});

describe('canMutateRecord', () => {
  const OWNER = 'owner-1';
  const HELPER = 'helper-1';
  const OTHER_HELPER = 'helper-2';

  it('lets the owner mutate their own record', () => {
    expect(canMutateRecord({ careTakerId: OWNER }, OWNER, true)).toBe(true);
  });

  it("lets the owner mutate a caretaker's record", () => {
    expect(canMutateRecord({ careTakerId: HELPER }, OWNER, true)).toBe(true);
  });

  it('lets the owner mutate a deleted account record', () => {
    expect(canMutateRecord({ careTakerId: null }, OWNER, true)).toBe(true);
  });

  it('lets a caretaker mutate their own record', () => {
    expect(canMutateRecord({ careTakerId: HELPER }, HELPER, false)).toBe(true);
  });

  it("blocks a caretaker from the owner's record", () => {
    expect(canMutateRecord({ careTakerId: OWNER }, HELPER, false)).toBe(false);
  });

  it("blocks a caretaker from another caretaker's record", () => {
    expect(canMutateRecord({ careTakerId: OTHER_HELPER }, HELPER, false)).toBe(false);
  });

  it('blocks a caretaker from a deleted account record', () => {
    expect(canMutateRecord({ careTakerId: null }, HELPER, false)).toBe(false);
  });
});

describe('validateRecordMutation', () => {
  it('accepts an edit against a live need with a matching type', () => {
    expect(validateRecordMutation(walkNeed, walkRecord)).toBeNull();
  });

  it('accepts an edit against a completed need (undo is the point)', () => {
    expect(validateRecordMutation({ ...walkNeed, completed: true }, walkRecord)).toBeNull();
  });

  it('rejects an edit against an archived need', () => {
    expect(validateRecordMutation({ ...walkNeed, archived: true }, walkRecord)).toBe('archived');
  });

  it('rejects a measurement type mismatch', () => {
    expect(validateRecordMutation(walkNeed, waterRecord)).toBe('measurement-mismatch');
  });

  it('checks archived before the measurement type', () => {
    expect(validateRecordMutation({ ...walkNeed, archived: true }, waterRecord)).toBe('archived');
  });
});
