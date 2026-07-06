/**
 * Error helpers preserving the old API conventions:
 * 401 authentication, 403 authorization, 404 missing,
 * 422 schema validation (see validate.ts), 400 business rules.
 */

export function badRequest(message: string): never {
  throw createError({ statusCode: 400, statusMessage: message, data: { message } });
}

export function unauthorized(message = 'Unauthorized'): never {
  throw createError({ statusCode: 401, statusMessage: message, data: { message } });
}

export function forbidden(message = 'Forbidden'): never {
  throw createError({ statusCode: 403, statusMessage: message, data: { message } });
}

export function notFound(message = 'Not found'): never {
  throw createError({ statusCode: 404, statusMessage: message, data: { message } });
}

export function tooManyRequests(message = 'Too many attempts. Please wait a moment and try again.'): never {
  throw createError({ statusCode: 429, statusMessage: message, data: { message } });
}
