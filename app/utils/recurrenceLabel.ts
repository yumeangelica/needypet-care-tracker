import type { RecurrenceRule } from '#shared/types/domain';

/** i18n key suffixes for ISO weekdays 1–7 (needs.weekdayShort.*). */
export const WEEKDAY_KEYS = ['mon', 'tue', 'wed', 'thu', 'fri', 'sat', 'sun'] as const;

type Translate = (key: string, params?: Record<string, unknown>) => string;

/**
 * Human label for a recurrence rule ("Every day", "Every 2 days", "Mon, Thu").
 * Null rules (one-off / history without a surviving rule) yield null so the
 * caller can simply hide the badge.
 */
export function formatRecurrenceLabel(rule: RecurrenceRule | null | undefined, t: Translate): string | null {
  if (!rule) {
    return null;
  }
  switch (rule.type) {
    case 'daily':
      return t('needs.repeatDaily');
    case 'interval':
      return t('needs.repeatEveryNDays', { n: rule.intervalDays });
    case 'weekly':
      return rule.weekdays
        .map((day) => t(`needs.weekdayShort.${WEEKDAY_KEYS[day - 1]}`))
        .join(', ');
  }
}
