import type { MeasurementShape, Need } from '../types/domain';
import { compareDateOnly } from './date';
import { needTemplateKey } from './measurement';

/**
 * Pure daily-rollover computation. Given a pet's non-archived needs and the
 * owner-local today:
 * - every open need left on a past day gets archived (paused ones included);
 * - each ACTIVE past need is a daily template that gets one fresh copy for
 *   today, de-duplicated by template key and skipped when today already has
 *   a live need with the same template;
 * - missed in-between days are NOT backfilled: archived copies could never
 *   receive care records, so an empty past day is the honest history.
 *
 * The 10-per-day cap is not applied here: dedup bounds the copies at the
 * previous day's cap.
 */

export type RolloverNeed = Pick<
  Need,
  'id' | 'dateFor' | 'category' | 'description' | 'archived' | 'isActive'
> &
  MeasurementShape;

export type RolloverTemplate = Pick<Need, 'category' | 'description'> & MeasurementShape;

export interface RolloverPlan {
  archiveIds: string[];
  createForToday: RolloverTemplate[];
}

export function computeRollover(needs: RolloverNeed[], today: string): RolloverPlan {
  const past = needs.filter(
    (need) => !need.archived && compareDateOnly(need.dateFor, today) < 0,
  );

  const todayKeys = new Set(
    needs
      .filter((need) => need.dateFor === today && !need.archived && need.isActive)
      .map(needTemplateKey),
  );

  const createForToday: RolloverTemplate[] = [];
  const seenKeys = new Set<string>();
  for (const need of past) {
    if (!need.isActive) {
      continue; // paused: stays on its day, does not roll forward
    }
    const key = needTemplateKey(need);
    if (seenKeys.has(key) || todayKeys.has(key)) {
      continue;
    }
    seenKeys.add(key);
    createForToday.push({
      category: need.category,
      description: need.description,
      duration: need.duration ? { ...need.duration } : undefined,
      quantity: need.quantity ? { ...need.quantity } : undefined,
    });
  }

  return { archiveIds: past.map((need) => need.id), createForToday };
}
