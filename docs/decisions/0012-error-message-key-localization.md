# 0012 — English API messages + i18n `messageKey` for localization

**Status**: Accepted

## Context

API error messages are consumed by two audiences with conflicting needs:
tests and clients want stable, grep-able strings; users want errors in their
own language (English or Finnish). Localizing the API `message` itself would
couple every test to the active locale and leak session state into error
shapes.

## Decision

The API `message` stays English, always. User-facing errors additionally
carry an optional i18n key in `error.data.messageKey` (e.g.
`errors.needCompleted`), which the client resolves against the active locale
via `app/utils/fetchErrors.ts`. Helpers in `server/utils/errors.ts` take the
key as an optional second argument; 429 always sends
`errors.tooManyRequests`. zod validation goes further: schema messages *are*
i18n keys (e.g. `'validation.quantityMin'`), resolved by the forms, so
client-side validation and 422 responses localize identically.

## Consequences

- Tests assert on stable English messages; users see localized copy; the
  same mechanism serves both.
- Every user-visible error needs its key present in **both** `en.ts` and
  `fi.ts` (`errors.*` / `validation.*` namespaces) — the parity test catches
  omissions.
- A business-rule error without a `messageKey` falls back to generic client
  copy — fine for errors users can't act on, wrong for ones they can.
