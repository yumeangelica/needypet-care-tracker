import { eq } from 'drizzle-orm';
import type { QuantityUnit } from '#shared/types/domain';
import { isNeedSatisfied } from '#shared/utils/measurement';
import type { Db } from '../db';
import { careRecords, needs } from '../db/schema';
import type { NeedRow } from './mappers';
import { toDomainNeed } from './mappers';

/** The query surface shared by the db singleton and a transaction handle. */
type Queryable = Pick<Db, 'select' | 'update'>;

/**
 * Re-sums every record of a need and flips `completed` in EITHER direction
 * when the target crossing changed — creating a record can complete a need,
 * editing or deleting one can un-complete it. Call inside the same
 * transaction as the record mutation. Returns the fresh need row.
 */
export async function recomputeNeedCompletion(
  tx: Queryable,
  needRow: NeedRow,
  now: string,
): Promise<NeedRow> {
  const need = toDomainNeed(needRow);
  const recordRows = await tx
    .select({
      durationValue: careRecords.durationValue,
      quantityValue: careRecords.quantityValue,
      quantityUnit: careRecords.quantityUnit,
    })
    .from(careRecords)
    .where(eq(careRecords.needId, needRow.id));
  const recordShapes = recordRows.map((row) => ({
    duration: row.durationValue !== null ? { value: row.durationValue, unit: 'minutes' as const } : undefined,
    quantity:
      row.quantityValue !== null
        ? { value: row.quantityValue, unit: (row.quantityUnit ?? 'ml') as QuantityUnit }
        : undefined,
  }));

  const satisfied = isNeedSatisfied(need, recordShapes);
  if (satisfied === needRow.completed) {
    return needRow;
  }
  const updated = await tx
    .update(needs)
    .set({ completed: satisfied, updatedAt: now })
    .where(eq(needs.id, needRow.id))
    .returning();
  return updated[0]!;
}
