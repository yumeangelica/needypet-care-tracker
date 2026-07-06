import { describe, expect, it } from 'vitest';
import { bucketRecordsByNeed } from '../../shared/utils/records';

function record(needId: string, date: string) {
  return { needId, date };
}

describe('bucketRecordsByNeed', () => {
  it('groups records by need id', () => {
    const buckets = bucketRecordsByNeed([
      record('a', '2026-07-05T10:00:00.000Z'),
      record('b', '2026-07-05T11:00:00.000Z'),
      record('a', '2026-07-05T12:00:00.000Z'),
    ]);
    expect(buckets.get('a')).toHaveLength(2);
    expect(buckets.get('b')).toHaveLength(1);
    expect(buckets.get('c')).toBeUndefined();
  });

  it('sorts each bucket ascending by timestamp', () => {
    const late = record('a', '2026-07-05T18:00:00.000Z');
    const early = record('a', '2026-07-05T06:00:00.000Z');
    const mid = record('a', '2026-07-05T12:00:00.000Z');
    const buckets = bucketRecordsByNeed([late, early, mid]);
    expect(buckets.get('a')).toEqual([early, mid, late]);
  });

  it('returns an empty map for no records', () => {
    expect(bucketRecordsByNeed([]).size).toBe(0);
  });
});
