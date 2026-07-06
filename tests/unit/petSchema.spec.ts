import { describe, expect, it } from 'vitest';
import { petSchema } from '../../shared/schemas/pet';

describe('petSchema', () => {
  it('accepts a full valid pet', () => {
    const result = petSchema.safeParse({
      name: 'Bella',
      species: 'Dog',
      breed: 'Golden Retriever',
      description: 'Sunshine in dog form.',
      birthday: '2021-05-14',
      image: { source: 'preset', key: 'dog' },
    });
    expect(result.success).toBe(true);
  });

  it('accepts a minimal pet and defaults the optional strings', () => {
    const parsed = petSchema.parse({ name: 'Nuppu' });
    expect(parsed.species).toBe('');
    expect(parsed.breed).toBe('');
    expect(parsed.description).toBe('');
  });

  it('accepts a null birthday', () => {
    expect(petSchema.safeParse({ name: 'Nuppu', birthday: null }).success).toBe(true);
  });

  it('rejects an impossible birthday date', () => {
    expect(petSchema.safeParse({ name: 'Nuppu', birthday: '2021-02-30' }).success).toBe(false);
  });

  it('does not reject a future birthday itself (future rule is a server business rule)', () => {
    expect(petSchema.safeParse({ name: 'Nuppu', birthday: '2999-01-01' }).success).toBe(true);
  });

  it('rejects a too-short name', () => {
    expect(petSchema.safeParse({ name: 'Bo' }).success).toBe(false);
  });

  it('rejects an unknown image key', () => {
    expect(
      petSchema.safeParse({ name: 'Nuppu', image: { source: 'preset', key: 'dragon' } }).success,
    ).toBe(false);
  });

  it('rejects a non-preset image source', () => {
    expect(
      petSchema.safeParse({ name: 'Nuppu', image: { source: 'upload', key: 'cat' } }).success,
    ).toBe(false);
  });
});
