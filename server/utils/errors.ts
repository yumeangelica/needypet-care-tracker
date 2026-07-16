/**
 * Error helpers preserving the old API conventions:
 * 401 authentication, 403 authorization, 404 missing,
 * 422 schema validation (see validate.ts), 400 business rules.
 *
 * `messageKey` is an optional i18n key (app/i18n/{en,fi}.ts) riding along in
 * `data` for user-facing errors: the API `message` stays English (stable for
 * clients and tests), while the UI resolves the key to the active locale
 * (see app/utils/fetchErrors.ts).
 */

export function badRequest(message: string, messageKey?: string): never {
  throw createError({
    statusCode: 400,
    statusMessage: message,
    data: { message, ...(messageKey ? { messageKey } : {}) },
  });
}

export function unauthorized(message = 'Unauthorized', messageKey?: string): never {
  throw createError({
    statusCode: 401,
    statusMessage: message,
    data: { message, ...(messageKey ? { messageKey } : {}) },
  });
}

export function forbidden(message = 'Forbidden'): never {
  throw createError({ statusCode: 403, statusMessage: message, data: { message } });
}

export function notFound(message = 'Not found'): never {
  throw createError({ statusCode: 404, statusMessage: message, data: { message } });
}

export function tooManyRequests(message = 'Too many attempts. Please wait a moment and try again.'): never {
  throw createError({
    statusCode: 429,
    statusMessage: message,
    data: { message, messageKey: 'errors.tooManyRequests' },
  });
}

export function serviceUnavailable(message: string, messageKey?: string): never {
  throw createError({
    statusCode: 503,
    statusMessage: message,
    data: { message, ...(messageKey ? { messageKey } : {}) },
  });
}
