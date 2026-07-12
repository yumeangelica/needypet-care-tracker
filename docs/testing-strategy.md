# Testing strategy

What gets tested where, how the suites run, and the definition of done for
any change. Vitest 4 under Bun (`bun --bun vitest`) in two suites with
separate configs.

```bash
bun run verify            # typecheck + unit + integration — the definition-of-done command
bun run typecheck         # vue-tsc via nuxt typecheck
bun run test              # unit + integration
bun run test:unit         # fast, no build
bun run test:integration  # builds once (~2 min), boots one Nitro server
```

## Unit tests — `tests/unit/` (`vitest.config.ts`)

Pure logic against the shared modules: zod schemas, date/datetime seams,
measurement and care rules, rollover planning, stats, digest, image
validation/storage, tokens, rate limiting, mailer — plus two meta-suites:

- **`i18n.spec.ts`** — en/fi key parity, non-empty values, and compilation of
  every message in both locales (a raw `@` in copy fails here instead of
  crashing at runtime).
- **`guardrails.spec.ts`** — static architecture checks over `app/`,
  `server/` and `shared/` sources. Each check names the ADR it enforces:
  no `temporal-polyfill` import outside `shared/utils/temporal.ts`
  (ADR-0004), no `new Date(` (ADR-0004), no `node:crypto` (ADR-0003), no
  Pinia/`defineStore` (ADR-0006), and no first-person plural ("we/our/us")
  in English UI copy (voice rule; Finnish verb forms can't be
  pattern-checked). Extend this file when a new invariant is worth
  machine-checking; keep checks import/call-site-shaped so comments and
  docs don't false-positive.

Conventions:

- `import { describe, expect, it } from 'vitest'`; environment is `node` by
  default — opt into the Nuxt env per file with
  `// @vitest-environment nuxt`.
- zod is inlined in the config (`server.deps.inline`) so it resolves under
  the Bun runtime; the three `server/utils` modules loaded directly by vitest
  (`tokens`, `imageStorage`, `rateLimit`) import Temporal via a **relative**
  path because the `#shared` alias is unregistered in the plain runner.

## Integration tests — `tests/integration/` (`vitest.integration.config.ts`)

Real HTTP against a production build: `global-setup.ts` builds the app once,
boots a single Nitro server (`Bun.spawn` on `.output/server/index.mjs`) on a
free port against a throwaway temp `bun:sqlite` database migrated from
`server/db/migrations/sqlite/` — which is why **regenerating migrations after
any schema change (`bun run db:generate`) is mandatory**. One shared server +
database means `fileParallelism: false`; specs must not assume exclusive
data, only exclusive names.

Seven specs cover the API behaviour: `auth`, `profile`, `needs-records`,
`permissions` (the owner/caretaker matrix and its 401/403/404 edges),
`rollover`, `digest`, `smoke`.

Conventions — reuse `tests/integration/helpers.ts`, never hand-roll:

- `api()` fetch wrapper, `loginAs`, `sessionCookieFrom`.
- Factories with overrides: `createUser`, `createUserWithSession`,
  `createPet`, `addCaretaker`, `createNeed`, `createRecord`; row getters and
  token-planting helpers; `testDb()` opens the server's SQLite file directly.
- `uniqueIp()` / `uniqueName()` — every request sends a unique
  `x-forwarded-for` so the rate limiter never trips a test.
- `TEST_PASSWORD = 'TestPaws123!'`. Fixtures hash with bcrypt cost 4 — fast,
  and it exercises the legacy-hash verify path on login.
- Any body matching `profileUpdateSchema` must include `locale` or it 422s.
- Rollover tests compute dates in the **owner's** timezone (owner-local
  "today"), never the machine's — see
  [`domain-model.md`](domain-model.md#dates-and-timezones).

## What to test for a change

| Change | Required tests |
| --- | --- |
| Shared util / business rule | unit spec next to the existing one for that module (happy path + edges + failures) |
| zod schema | unit spec (`*Schemas.spec.ts` naming) with valid/invalid payloads |
| New/changed endpoint | integration spec: happy path, 422 payload, 401 unauthenticated, 403 wrong user, 404 missing resource |
| Permission-relevant change | extend `permissions.spec.ts` for both roles |
| New UI copy | keys in **both** `en.ts` and `fi.ts` (parity test fails otherwise) |
| Schema change | regenerate migrations (`bun run db:generate`) or the integration suite runs against a stale DB |

## Known gaps (tracked in [`../tasks/backlog.md`](../tasks/backlog.md))

- No component/E2E tests — the UI is verified manually (ad-hoc Playwright).
  When browser tests arrive: block the service worker, or authed SSR routes
  may serve the `/offline` fallback on client navigation (prod builds only).
- The rate limiter's durable-store variant is untested because it doesn't
  exist yet.

## Definition of done

A change is done when:

1. `bun run verify` is green (typecheck + unit + integration).
2. New behaviour has tests per the table above; changed behaviour has
   updated tests — testing behaviour, not implementation.
3. i18n keys exist in both locales; migrations are regenerated if the schema
   changed.
4. No new dependencies without stated justification; no guardrail
   or invariant violations (see [`architecture.md`](architecture.md#invariants)).
