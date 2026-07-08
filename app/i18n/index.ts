import { createI18n } from 'vue-i18n';
import type { Locale } from '#shared/types/domain';
import en from './en';
import fi from './fi';

/**
 * The two message trees, exported raw so tests can walk them for key parity
 * without booting a full i18n instance.
 */
export const messages = { en, fi };

export type MessageSchema = typeof en;

/**
 * Build a Composition-API vue-i18n instance for the given locale. English is
 * always the fallback, so a missing Finnish key degrades to English rather
 * than showing the raw key.
 */
export function createAppI18n(locale: Locale) {
  return createI18n({
    legacy: false,
    globalInjection: true,
    locale,
    fallbackLocale: 'en',
    messages,
  });
}
