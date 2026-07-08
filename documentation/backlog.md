# Backlog

The core roadmap is done (auth, pets, care tasks + records, caretakers, diary,
stats, digest, PWA, fi/en i18n). This is a short list of what could come next —
nice-to-haves and hardening, not missing essentials.

Tick a box (`- [x]`) when done.

## Features / product

- [ ] **Push notifications** for the daily digest (currently email only) — the PWA
  service worker is already in place, so Web Push is the natural next layer.
- [ ] **Recurring / scheduled needs** beyond the daily rollover (e.g. "every Mon/Thu",
  "every 3 days") instead of one fixed daily set.
- [ ] **Care task templates** — quick-add common tasks (walk, feed, meds) instead of
  typing each one.
- [ ] **Multiple photos per pet** / a small gallery (today a pet has one image).
- [ ] **Caretaker invites by email/link** for people without an account yet (today a
  caretaker must already be a registered user, added by username).
- [ ] **Per-need history charts** on the stats page (trend over weeks), not just the
  weekly summary.
- [ ] **Localized pet species/category presets** — user-authored categories stay as
  typed; only preset labels are localized so far.

## Quality / hardening

- [ ] **Accessibility audit** of the new i18n locale picker and Finnish copy
  (keyboard + screen reader), plus a general WCAG 2.2 AA pass.
- [ ] **Component/E2E tests** for the Vue components (currently unit tests cover
  shared logic and integration tests cover the API; the UI is verified manually
  / ad-hoc Playwright).
- [ ] **Confirmation/reset emails localized** to the user's locale (only the daily
  digest is localized today).
- [ ] **Rate-limit store** — the in-memory limiter resets on redeploy and isn't
  shared across instances; move to a durable/shared store before scaling out.

## Dependency audit — done (bun-native pass)

Reviewed whether the runtime already covers things pulled in as deps, then went
fully bun-native. Outcome:

- [x] `happy-dom` — **removed**. Unused: no vitest config referenced it and no test
  opted into the Nuxt DOM env (it was only an optional peer of `@nuxt/test-utils`).
- [x] `clsx` — **removed**. Zero imports; Vue's built-in class binding covers it.
  `tailwind-merge` was also unused and removed in the same pass.
- [x] `@lucide/vue` — **kept**. 18 icons across ~15 files; ships ESM +
  `sideEffects:false`, so Vite tree-shakes it to the used icons (the large install
  size is not bundle size). Cuteness stays.
- [x] `bcryptjs` — **replaced** with `Bun.password` (argon2id, OWASP first choice).
  Native, zero-dependency, and it still verifies existing bcrypt hashes, so logins
  keep working and legacy hashes upgrade to argon2id on the next sign-in. Helper
  lives in `server/utils/password.ts`.

Also in this pass:

- `better-sqlite3` (+ `@types/better-sqlite3`) and `tsx` removed — local SQLite
  now uses `bun:sqlite` (via `drizzle-orm/bun-sqlite`); test toolchain + db scripts
  run under Bun.
- `postgres` (postgres.js) removed — production Postgres now uses native `Bun.sql`
  (via `drizzle-orm/bun-sql`), keeping `prepare: false` for the Supabase pooler.
- `vue-router` removed from `dependencies` — it is a direct dep of `nuxt` at the
  same range and had zero explicit imports (routing goes through Nuxt auto-imports).
- `typescript` added as an explicit devDependency — the project runs `tsc` (via
  `vue-tsc` / `nuxt typecheck`) directly, so it is declared rather than relied on
  transitively. Node types come from `@types/bun` (no separate `@types/node`).

The app is now bun-native end to end (runtime, both DB dialects, hashing, tests,
scripts); Node is no longer required.
