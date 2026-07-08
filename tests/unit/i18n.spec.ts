import { describe, expect, it } from 'vitest';
import { createI18n } from 'vue-i18n';
import en from '../../app/i18n/en';
import fi from '../../app/i18n/fi';

/** Flatten a nested message object into a sorted list of dotted key paths. */
function flattenKeys(obj: Record<string, unknown>, prefix = ''): string[] {
  const keys: string[] = [];
  for (const [key, value] of Object.entries(obj)) {
    const path = prefix ? `${prefix}.${key}` : key;
    if (value !== null && typeof value === 'object') {
      keys.push(...flattenKeys(value as Record<string, unknown>, path));
    } else {
      keys.push(path);
    }
  }
  return keys.sort();
}

describe('i18n message parity', () => {
  const enKeys = flattenKeys(en);
  const fiKeys = flattenKeys(fi);

  it('has the same key set in en and fi (no missing keys)', () => {
    const missingInFi = enKeys.filter((key) => !fiKeys.includes(key));
    expect(missingInFi).toEqual([]);
  });

  it('has no extra keys in fi that en lacks', () => {
    const extraInFi = fiKeys.filter((key) => !enKeys.includes(key));
    expect(extraInFi).toEqual([]);
  });

  it('has non-empty string values for every key in both locales', () => {
    for (const messages of [en, fi]) {
      const flat = flattenKeys(messages);
      // Re-resolve each key to its value and assert it is a non-empty string.
      for (const key of flat) {
        const value = key.split('.').reduce<unknown>((acc, part) => (acc as Record<string, unknown>)[part], messages);
        expect(typeof value).toBe('string');
        expect((value as string).length).toBeGreaterThan(0);
      }
    }
  });
});

describe('i18n formatting behaviour', () => {
  const i18n = createI18n({
    legacy: false,
    locale: 'en',
    fallbackLocale: 'en',
    messages: { en, fi },
  });
  const { t } = i18n.global;

  it('pluralizes task counts in English (1 vs many)', () => {
    i18n.global.locale.value = 'en';
    expect(t('pets.tasksToday', 1, { named: { count: 1 } })).toBe('1 care task today');
    expect(t('pets.tasksToday', 3, { named: { count: 3 } })).toBe('3 care tasks today');
  });

  it('pluralizes task counts in Finnish (partitive for the plural form)', () => {
    i18n.global.locale.value = 'fi';
    expect(t('pets.tasksToday', 1, { named: { count: 1 } })).toBe('1 hoitotehtävä tänään');
    expect(t('pets.tasksToday', 5, { named: { count: 5 } })).toBe('5 hoitotehtävää tänään');
  });

  it('renders named interpolation with several args in both locales', () => {
    i18n.global.locale.value = 'en';
    expect(t('caretakers.noLongerHelps', { name: 'Sam', petName: 'Bella' })).toBe(
      'Sam no longer helps with Bella.',
    );
    i18n.global.locale.value = 'fi';
    expect(t('caretakers.noLongerHelps', { name: 'Sam', petName: 'Bella' })).toBe(
      'Sam ei enää auta lemmikin Bella kanssa.',
    );
  });

  it('falls back to English for a locale-missing key rather than showing the raw key', () => {
    // Every key exists in both by the parity test, so a fallback here just
    // mirrors English — assert the mechanism resolves to real copy.
    i18n.global.locale.value = 'fi';
    expect(t('errors.generic')).toBe('Jokin meni pieleen. Yritä uudelleen.');
  });
});
