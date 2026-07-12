# 0007 — Plain vue-i18n plugin with session-derived locale

**Status**: Accepted

## Context

The UI ships in English and Finnish. The standard Nuxt module `@nuxtjs/i18n`
centres on per-locale routing and SEO (locale prefixes in URLs, alternate
links) — irrelevant for an auth-gated app where no language ever appears in
the URL, and it would add routing complexity for nothing.

## Decision

Use `vue-i18n` directly as a Nuxt plugin (`app/plugins/i18n.ts`), with
`useI18n` auto-imported via `nuxt.config.ts` `imports.presets`. The locale is
stored on the user profile (`users.locale`), cached in the session payload,
and read from the session during SSR — server and client render the same
language with no hydration flicker. Signed-out pages are English; there is no
browser-language autodetect. `app/i18n/en.ts` is the source-of-truth shape;
`fi.ts` mirrors every key. Finnish is a transcreation (keeps the warm 🐾
tone), with named interpolation and plural pipes — no `${}` concatenation in
copy.

## Consequences

- `tests/unit/i18n.spec.ts` enforces key parity, non-empty values and message
  compilation (a raw `@` in copy is a unit failure, not a runtime crash).
- Every UI string change touches both `en.ts` and `fi.ts`.
- The digest email is localized to the recipient; confirmation/reset emails
  are English (localization is a backlog item). The prerendered `/offline`
  page and the PWA manifest are build-time artifacts and stay English.
