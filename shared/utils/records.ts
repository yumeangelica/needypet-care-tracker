/**
 * Groups care records per need id, each bucket sorted ascending by timestamp
 * (the order CareRecordList and the progress math expect).
 */
export function bucketRecordsByNeed<T extends { needId: string; date: string }>(
  records: T[],
): Map<string, T[]> {
  const buckets = new Map<string, T[]>();
  for (const record of records) {
    const bucket = buckets.get(record.needId);
    if (bucket) {
      bucket.push(record);
    } else {
      buckets.set(record.needId, [record]);
    }
  }
  for (const bucket of buckets.values()) {
    bucket.sort((a, b) => a.date.localeCompare(b.date));
  }
  return buckets;
}
