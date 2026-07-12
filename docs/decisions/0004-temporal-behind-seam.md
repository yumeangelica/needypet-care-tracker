# 0004 — Temporal API behind one seam module; strings at every boundary

**Status**: Accepted

## Context

Date/time logic originally ran on `new Date`, including a hand-rolled DST
resolver (double-offset dance) and a `new Date('<day>T00:00:00Z')` UI idiom
that could shift date-only labels across timezones. TC39 Temporal is Stage 4
and models the domain correctly (`PlainDate` has no zone), but Bun 1.3 ships
no native `Temporal` and the browser floor predates it.

## Decision

All date/time **computation** uses Temporal via `temporal-polyfill` (~15–20
kB, a droppable bridge), imported **only** through `shared/utils/temporal.ts`
— when runtimes ship native Temporal, dropping the dep is a one-line change
there. Temporal never crosses a boundary: storage (TEXT columns), JSON DTOs
and zod schemas stay `YYYY-MM-DD` / ISO-UTC strings, and the seam helpers in
`shared/utils/{date,datetime}.ts` keep string-in/string-out signatures.
`new Date` was eliminated from app/server/shared code entirely;
`instantToIso` pins millisecond precision so ISO output stays byte-identical
to the old `toISOString()`.

## Consequences

- Existing string-based tests survived the migration as the regression net.
- Guardrails (`tests/unit/guardrails.spec.ts`) enforce both rules: no
  `temporal-polyfill` import outside the seam, no `new Date(` in source.
- `Intl.supportedValuesOf('timeZone')` stays for the tz allowlist (Temporal
  has no zone-list API); whether it includes `'UTC'` is ICU-dependent, so
  never validate a `?? 'UTC'` fallback through `isSupportedTimeZone`.
- Three `server/utils` modules loaded directly by vitest (`tokens`,
  `imageStorage`, `rateLimit`) import the seam via a relative path — the
  `#shared` alias is unregistered in the plain runner.
