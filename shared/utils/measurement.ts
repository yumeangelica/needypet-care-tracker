import type { MeasurementShape } from '../types/domain';

/**
 * Measurement-shape rules shared by needs and care records:
 * - exactly one of `duration` / `quantity` must be present;
 * - a care record's shape must match its parent need's shape;
 * - a need is satisfied when the sum of its records' values reaches its value.
 */

export type MeasurementType = 'duration' | 'quantity';

/** The measurement type carried by a need/record, or null when the shape is invalid. */
export function getMeasurementType(shape: MeasurementShape): MeasurementType | null {
  const hasDuration = shape.duration != null;
  const hasQuantity = shape.quantity != null;
  if (hasDuration === hasQuantity) {
    return null; // none or both -> invalid
  }
  return hasDuration ? 'duration' : 'quantity';
}

/** Exactly-one-measurement invariant. */
export function hasExactlyOneMeasurement(shape: MeasurementShape): boolean {
  return getMeasurementType(shape) !== null;
}

/** Care record measurement must match the parent need's measurement type. */
export function measurementTypesMatch(need: MeasurementShape, record: MeasurementShape): boolean {
  const needType = getMeasurementType(need);
  return needType !== null && needType === getMeasurementType(record);
}

/** The numeric value of whichever measurement is present (0 when missing). */
export function getMeasurementValue(shape: MeasurementShape): number {
  return shape.duration?.value ?? shape.quantity?.value ?? 0;
}

/**
 * A need counts as completed when the summed record values reach the need's
 * own value. Records with a missing value contribute 0 (matches old backend).
 */
export function isNeedSatisfied(need: MeasurementShape, records: MeasurementShape[]): boolean {
  const target = getMeasurementValue(need);
  if (target <= 0) {
    return false;
  }
  const total = records.reduce((sum, record) => sum + getMeasurementValue(record), 0);
  return total >= target;
}

/**
 * Stable identity key for rollover de-duplication: two needs are copies of the
 * same daily template when category, description and measurement all match.
 */
export function needTemplateKey(
  need: MeasurementShape & { category: string; description: string },
): string {
  return JSON.stringify({
    category: need.category,
    description: need.description,
    measure: need.duration
      ? { type: 'duration', value: need.duration.value, unit: need.duration.unit }
      : need.quantity
        ? { type: 'quantity', value: need.quantity.value, unit: need.quantity.unit }
        : null,
  });
}
