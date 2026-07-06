import type { CareRecord, MeasurementShape, Need } from '../types/domain';
import { measurementTypesMatch } from './measurement';

/**
 * Why a care record may not be added to a need. Checks run in the legacy
 * backend's order: completed -> archived -> measurement type -> care day.
 */
export type RecordRejection = 'completed' | 'archived' | 'measurement-mismatch' | 'not-today';

export function validateRecordAgainstNeed(
  need: Pick<Need, 'completed' | 'archived' | 'dateFor'> & MeasurementShape,
  record: MeasurementShape,
  ownerToday: string,
): RecordRejection | null {
  if (need.completed) {
    return 'completed';
  }
  if (need.archived) {
    return 'archived';
  }
  if (!measurementTypesMatch(need, record)) {
    return 'measurement-mismatch';
  }
  // Records may only target the owner's current care day. A paused need still
  // accepts records (legacy parity) — pausing only stops tomorrow's rollover.
  if (need.dateFor !== ownerToday) {
    return 'not-today';
  }
  return null;
}

/**
 * Who may edit or delete a care record: the pet's owner may change anything
 * (including records whose author's account was deleted); a caretaker may
 * only touch their own records.
 */
export function canMutateRecord(
  record: Pick<CareRecord, 'careTakerId'>,
  userId: string,
  isOwner: boolean,
): boolean {
  if (isOwner) {
    return true;
  }
  return record.careTakerId !== null && record.careTakerId === userId;
}

/**
 * Why an existing record may not be edited or deleted. A completed need does
 * NOT block mutation — undoing an accidental "All Done!" is the whole point;
 * completion is recomputed afterwards. Archived (rolled-over) days are frozen.
 */
export type RecordMutationRejection = 'archived' | 'measurement-mismatch';

export function validateRecordMutation(
  need: Pick<Need, 'archived'> & MeasurementShape,
  newShape: MeasurementShape,
): RecordMutationRejection | null {
  if (need.archived) {
    return 'archived';
  }
  if (!measurementTypesMatch(need, newShape)) {
    return 'measurement-mismatch';
  }
  return null;
}
