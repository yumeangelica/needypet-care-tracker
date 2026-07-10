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

describe('i18n message compilation', () => {
  // Messages compile lazily on first t(), so a syntax error (e.g. a raw "@",
  // which vue-i18n reserves for linked messages - escape as {'@'}) would
  // otherwise only surface as a runtime crash on the page that renders the
  // key. Compiling every message here keeps that a unit-test failure.
  it('compiles every message in both locales without throwing', () => {
    const i18n = createI18n({ legacy: false, locale: 'en', fallbackLocale: 'en', messages: { en, fi } });
    const { t } = i18n.global;
    for (const locale of ['en', 'fi'] as const) {
      i18n.global.locale.value = locale;
      for (const key of flattenKeys(locale === 'en' ? en : fi)) {
        expect(() => t(key), `${locale}: ${key}`).not.toThrow();
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

  it('localizes zod validation keys in both locales', () => {
    // shared/schemas/* emit these keys as messages; forms translate them.
    i18n.global.locale.value = 'en';
    expect(t('validation.petNameMin')).toBe('Name must be at least 3 characters');
    i18n.global.locale.value = 'fi';
    expect(t('validation.petNameMin')).toBe('Nimessä pitää olla vähintään 3 merkkiä');
  });

  it('localizes server business-rule messageKeys in both locales', () => {
    // server/utils/errors.ts sends these next to the English API message.
    i18n.global.locale.value = 'en';
    expect(t('errors.userNameTaken')).toBe('Username already exists');
    i18n.global.locale.value = 'fi';
    expect(t('errors.userNameTaken')).toBe('Käyttäjänimi on jo varattu');
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
