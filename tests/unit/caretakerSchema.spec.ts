import { describe, expect, it } from 'vitest';
import { caretakerAddSchema } from '../../shared/schemas/caretaker';

describe('caretakerAddSchema', () => {
  it('accepts a valid username', () => {
    expect(caretakerAddSchema.safeParse({ userName: 'helper' }).success).toBe(true);
  });

  it('rejects a too-short username', () => {
    expect(caretakerAddSchema.safeParse({ userName: 'ab' }).success).toBe(false);
  });

  it('rejects a too-long username', () => {
    expect(caretakerAddSchema.safeParse({ userName: 'a'.repeat(41) }).success).toBe(false);
  });

  it('rejects a missing username', () => {
    expect(caretakerAddSchema.safeParse({}).success).toBe(false);
  });
});
