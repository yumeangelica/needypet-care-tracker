import { describe, expect, it } from 'vitest';
import type { ImportContext, RawBundle } from '../../server/db/import/validate';
import { validateBundle } from '../../server/db/import/validate';

/**
 * Minimal valid bundle: two users (anna owns Rex, ben helps), one need and
 * one care record by ben. Overrides replace whole files.
 */
function makeBundle(overrides: Partial<Record<keyof RawBundle, unknown>> = {}): RawBundle {
  const users = [
    {
      legacyId: 'u1',
      userName: 'anna',
      email: 'Anna@Example.com',
      passwordHash: '$2b$10$hash',
      emailConfirmed: true,
      timezone: 'Europe/Helsinki',
      createdAt: '2026-01-01T10:00:00.000Z',
      updatedAt: '2026-01-01T10:00:00.000Z',
    },
    {
      legacyId: 'u2',
      userName: 'ben',
      email: 'ben@example.com',
      passwordHash: '$2b$10$hash2',
      emailConfirmed: false,
      timezone: 'Europe/Helsinki',
      createdAt: '2026-01-02T10:00:00.000Z',
      updatedAt: '2026-01-02T10:00:00.000Z',
    },
  ];
  const pets = [
    {
      legacyId: 'p1',
      ownerLegacyId: 'u1',
      name: 'Rex',
      species: 'Dog',
      breed: null,
      description: null,
      birthday: '2020-03-01',
      image: { source: 'preset', key: 'dog' },
      lastRolledNeedDate: '2026-07-01',
      createdAt: '2026-01-03T10:00:00.000Z',
      updatedAt: '2026-01-03T10:00:00.000Z',
    },
  ];
  const petCaretakers = [{ petLegacyId: 'p1', userLegacyId: 'u2' }];
  const needs = [
    {
      legacyId: 'n1',
      petLegacyId: 'p1',
      dateFor: '2026-07-01',
      category: 'Breakfast',
      description: 'Dry food.',
      quantity: { value: 100, unit: 'g' },
      completed: true,
      archived: true,
      isActive: false,
      createdAt: '2026-07-01T05:00:00.000Z',
      updatedAt: '2026-07-01T08:00:00.000Z',
    },
  ];
  const careRecords = [
    {
      legacyId: 'r1',
      needLegacyId: 'n1',
      petLegacyId: 'p1',
      careTakerLegacyId: 'u2',
      date: '2026-07-01T07:30:00.000Z',
      note: 'All eaten.',
      quantity: { value: 100, unit: 'g' },
      timezone: 'Europe/Helsinki',
      createdAt: '2026-07-01T07:30:00.000Z',
    },
  ];
  const manifest = {
    formatVersion: 1,
    exportedAt: '2026-07-05T12:00:00.000Z',
    source: 'needypet-mongo',
    counts: {
      users: (overrides.users as unknown[] | undefined)?.length ?? users.length,
      pets: (overrides.pets as unknown[] | undefined)?.length ?? pets.length,
      petCaretakers: (overrides.petCaretakers as unknown[] | undefined)?.length ?? petCaretakers.length,
      needs: (overrides.needs as unknown[] | undefined)?.length ?? needs.length,
      careRecords: (overrides.careRecords as unknown[] | undefined)?.length ?? careRecords.length,
    },
  };
  return { manifest, users, pets, petCaretakers, needs, careRecords, ...overrides };
}

function emptyContext(): ImportContext {
  return {
    existingLegacyIds: {
      users: new Set(),
      pets: new Set(),
      needs: new Set(),
      careRecords: new Set(),
    },
    existingUserNames: new Set(),
    existingEmails: new Set(),
  };
}

function expectError(bundle: RawBundle, fragment: string, context = emptyContext()): void {
  const result = validateBundle(bundle, context);
  expect(result.ok).toBe(false);
  if (!result.ok) {
    expect(result.errors.join('\n')).toContain(fragment);
  }
}

describe('validateBundle', () => {
  it('accepts the happy path and prepares insert rows with new UUIDs', () => {
    const result = validateBundle(makeBundle(), emptyContext());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.users).toHaveLength(2);
      expect(result.rows.users[0]!.email).toBe('anna@example.com'); // lowercased
      expect(result.rows.pets[0]!.ownerId).toBe(result.rows.users[0]!.id);
      expect(result.rows.petCaretakers[0]!.userId).toBe(result.rows.users[1]!.id);
      expect(result.rows.needs[0]!.quantityValue).toBe(100);
      expect(result.rows.careRecords[0]!.needId).toBe(result.rows.needs[0]!.id);
      expect(result.rows.careRecords[0]!.careTakerId).toBe(result.rows.users[1]!.id);
      expect(result.rows.pets[0]!.legacyId).toBe('p1');
    }
  });

  it('preserves a null careTakerLegacyId as a null careTakerId', () => {
    const bundle = makeBundle();
    (bundle.careRecords as Record<string, unknown>[])[0]!.careTakerLegacyId = null;
    const result = validateBundle(bundle, emptyContext());
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.rows.careRecords[0]!.careTakerId).toBeNull();
    }
  });

  it('rejects an unsupported formatVersion', () => {
    const bundle = makeBundle();
    (bundle.manifest as Record<string, unknown>).formatVersion = 2;
    expectError(bundle, 'formatVersion');
  });

  it('rejects a manifest count mismatch', () => {
    const bundle = makeBundle();
    (bundle.manifest as { counts: Record<string, number> }).counts.needs = 5;
    expectError(bundle, 'counts.needs');
  });

  it('rejects a duplicate legacyId within a file', () => {
    const bundle = makeBundle();
    const needs = bundle.needs as Record<string, unknown>[];
    needs.push({ ...needs[0]! });
    (bundle.manifest as { counts: Record<string, number> }).counts.needs = 2;
    expectError(bundle, 'duplicate legacyId "n1"');
  });

  it('rejects an unresolved pet owner', () => {
    const bundle = makeBundle();
    (bundle.pets as Record<string, unknown>[])[0]!.ownerLegacyId = 'ghost';
    expectError(bundle, 'owner "ghost" not found');
  });

  it('rejects an owner as their own caretaker', () => {
    const bundle = makeBundle({ petCaretakers: [{ petLegacyId: 'p1', userLegacyId: 'u1' }] });
    expectError(bundle, 'cannot be a caretaker of their own pet');
  });

  it('rejects a duplicate caretaker pair', () => {
    const bundle = makeBundle({
      petCaretakers: [
        { petLegacyId: 'p1', userLegacyId: 'u2' },
        { petLegacyId: 'p1', userLegacyId: 'u2' },
      ],
    });
    expectError(bundle, 'duplicate caretaker pair');
  });

  it("rejects a need pointing at a pet that isn't in the bundle", () => {
    const bundle = makeBundle();
    (bundle.needs as Record<string, unknown>[])[0]!.petLegacyId = 'ghost';
    expectError(bundle, 'pet "ghost" not found');
  });

  it("rejects a record whose pet disagrees with its need's pet", () => {
    const bundle = makeBundle();
    const pets = bundle.pets as Record<string, unknown>[];
    pets.push({ ...pets[0]!, legacyId: 'p2', name: 'Other' });
    (bundle.manifest as { counts: Record<string, number> }).counts.pets = 2;
    (bundle.careRecords as Record<string, unknown>[])[0]!.petLegacyId = 'p2';
    expectError(bundle, 'disagrees with its need');
  });

  it('rejects a record measurement type mismatch with its need', () => {
    const bundle = makeBundle();
    const record = (bundle.careRecords as Record<string, unknown>[])[0]!;
    delete record.quantity;
    record.duration = { value: 30, unit: 'minutes' };
    expectError(bundle, 'measurement type does not match');
  });

  it('rejects a dangling non-null careTakerLegacyId', () => {
    const bundle = makeBundle();
    (bundle.careRecords as Record<string, unknown>[])[0]!.careTakerLegacyId = 'ghost';
    expectError(bundle, 'careTaker "ghost" not found');
  });

  it('rejects an invalid date-only field', () => {
    const bundle = makeBundle();
    (bundle.needs as Record<string, unknown>[])[0]!.dateFor = '2026-02-30';
    expectError(bundle, 'needs.json[0]');
  });

  it('rejects an invalid timestamp', () => {
    const bundle = makeBundle();
    (bundle.careRecords as Record<string, unknown>[])[0]!.date = '2026-07-01 07:30';
    expectError(bundle, 'Invalid UTC ISO timestamp');
  });

  it('rejects an unsupported timezone', () => {
    const bundle = makeBundle();
    (bundle.users as Record<string, unknown>[])[0]!.timezone = 'Mars/Olympus';
    expectError(bundle, 'Unsupported IANA timezone');
  });

  it('rejects an unknown preset image key', () => {
    const bundle = makeBundle();
    (bundle.pets as Record<string, unknown>[])[0]!.image = { source: 'preset', key: 'dragon' };
    expectError(bundle, 'pets.json[0]');
  });

  it('rejects a need with both measurements', () => {
    const bundle = makeBundle();
    (bundle.needs as Record<string, unknown>[])[0]!.duration = { value: 10, unit: 'minutes' };
    expectError(bundle, 'Exactly one measurement');
  });

  it('rejects a case-insensitive duplicate email within the bundle', () => {
    const bundle = makeBundle();
    (bundle.users as Record<string, unknown>[])[1]!.email = 'ANNA@example.com';
    expectError(bundle, 'duplicate email');
  });

  it('rejects case-insensitive duplicate usernames within the bundle', () => {
    const bundle = makeBundle();
    (bundle.users as Record<string, unknown>[])[1]!.userName = 'ANNA';
    expectError(bundle, 'duplicate userName');
  });

  it('accepts supported Unicode usernames', () => {
    const bundle = makeBundle();
    (bundle.users as Record<string, unknown>[])[0]!.userName = 'Änne';
    expect(validateBundle(bundle, emptyContext()).ok).toBe(true);
  });

  it('rejects canonically equivalent duplicate usernames', () => {
    const bundle = makeBundle();
    (bundle.users as Record<string, unknown>[])[0]!.userName = 'Ånna';
    (bundle.users as Record<string, unknown>[])[1]!.userName = 'A\u030Anna';
    expectError(bundle, 'duplicate userName');
  });

  it('rejects a userName that already exists in the database', () => {
    const context = emptyContext();
    context.existingUserNames.add('anna');
    expectError(makeBundle(), 'userName "anna" already exists', context);
  });

  it('rejects a legacyId that was already imported', () => {
    const context = emptyContext();
    context.existingLegacyIds.pets.add('p1');
    expectError(makeBundle(), 'legacyId "p1" was already imported', context);
  });

  it('collects multiple errors instead of stopping at the first', () => {
    const bundle = makeBundle();
    (bundle.pets as Record<string, unknown>[])[0]!.ownerLegacyId = 'ghost';
    (bundle.users as Record<string, unknown>[])[0]!.timezone = 'Mars/Olympus';
    const result = validateBundle(bundle, emptyContext());
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.length).toBeGreaterThanOrEqual(2);
    }
  });
});
