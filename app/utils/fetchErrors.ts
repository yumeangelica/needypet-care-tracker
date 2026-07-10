import { FetchError } from 'ofetch';

type Translate = (key: string) => string;

/**
 * User-facing message for a failed $fetch call. Server business-rule errors
 * carry an optional i18n `messageKey` next to their (stable, English) API
 * `message` — prefer the key so the UI follows the active locale, fall back
 * to the raw message, and end at the generic copy for anything unexpected.
 */
export function resolveFetchError(error: unknown, t: Translate, fallbackKey = 'errors.generic'): string {
  if (error instanceof FetchError) {
    const data = error.data as { message?: string; messageKey?: string } | undefined;
    if (data?.messageKey) {
      return t(data.messageKey);
    }
    if (data?.message) {
      return data.message;
    }
  }
  return t(fallbackKey);
}
