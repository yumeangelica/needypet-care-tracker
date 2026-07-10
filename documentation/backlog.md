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
- [ ] **TypeScript 7 (native compiler)** — blocked on vue-tsc / Vue language
  tooling support; stays on TS 6 until the Vue toolchain catches up.
- [ ] **Offline page is English-only** — `/offline` is prerendered at build
  time, so its copy cannot follow the per-user locale. Accepted for a static
  fallback page; revisit only if a bilingual static fallback is ever needed.

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
- `postgres` (postgres.js) removed during the bun-native pass. Postgres itself was
  later dropped entirely (see "SQLite-only" below).
- `vue-router` removed from `dependencies` — it is a direct dep of `nuxt` at the
  same range and had zero explicit imports (routing goes through Nuxt auto-imports).
- `typescript` added as an explicit devDependency — the project runs `tsc` (via
  `vue-tsc` / `nuxt typecheck`) directly, so it is declared rather than relied on
  transitively. Node types come from `@types/bun` (no separate `@types/node`).

The app is now bun-native end to end (runtime, DB, hashing, tests, scripts); Node
is no longer required.

## SQLite-only + Web Crypto + R2 — done (modernization pass)

Removed the last legacy/dialect-split surfaces so the app is one dialect, fully
Web-standard, and free to host:

- [x] **Postgres removed; SQLite everywhere.** Deleted `schema.pg.ts`, the pg
  migrations, `drizzle-pg.config.ts`, the `db:*:pg` scripts, and the `Bun.sql`
  branch in `useDb()`. A dev-SQLite/prod-Postgres split invites dialect drift
  (ILIKE, jsonb, date handling) and means testing a different engine than you
  deploy. `schema.ts` is now a direct re-export of `schema.sqlite.ts`.
- [x] **Turso/libSQL wired for prod.** `useDb()` switches on `NUXT_DB_URL`: a
  `libsql://` Turso URL (+ `NUXT_DB_AUTH_TOKEN`) selects a `drizzle-orm/libsql`
  client — **same SQLite dialect, same schema, same migrations**, zero drift.
  `withTransaction` is provider-aware (drizzle's interactive transaction on
  libSQL, the manual `begin immediate` path on bun:sqlite) and `bun run
  db:migrate` applies the migration set to either target at deploy time. Turso
  free tier is ~9 GB. This is the recommended prod DB path.
- [x] **Full Web Crypto (no `node:crypto` in app code).** `server/utils/tokens.ts`
  uses `crypto.getRandomValues` + `crypto.subtle.digest`; the digest-secret compare
  in `daily-digest.post.ts` uses `subtle.digest` + a constant-time XOR (no
  `timingSafeEqual`). Token helpers are now async.
- [x] **Bun-native file I/O.** `LocalDiskStorage.put` → `Bun.write` (auto-creates
  dirs); the `/uploads` route → `Bun.file` (`.exists()`/`.size`/`.stream()`).
- [x] **Image hosting: Supabase → Cloudflare R2.** `R2Storage` (S3-compatible REST,
  AWS SigV4 signed via Web Crypto HMAC — no SDK, no `node:crypto`) replaces
  `SupabaseStorage`. R2 free tier: 10 GB + **zero egress** + no inactivity pause.
  Public bucket for reads (unguessable UUID keys); `NUXT_UPLOADS_PROVIDER=r2` plus
  `NUXT_UPLOADS_R2_*`. Dev stays local disk.

## Temporal API — done (modernization pass)

Replaced native `Date` with the TC39 **Temporal** API for all date/time logic.
Despite the dependency-reduction ethos above, `temporal-polyfill` (~15–20 kB, MIT,
Temporal is Stage 4) was added deliberately: Bun 1.3 ships no native `Temporal`
yet (verified `typeof Temporal === 'undefined'`) and the browser floor predates
it, so the polyfill is a **droppable bridge**. It is imported only through
`shared/utils/temporal.ts` — when the runtime + browser floor ship native
Temporal, dropping the dep is a one-line change there, no consumer edits.

- [x] **Seam rewrite.** `shared/utils/{date,datetime}.ts` internals now run on
  Temporal (`PlainDate`, `PlainDateTime`, `ZonedDateTime`, `Instant`). Public
  signatures stay string-in/string-out, so the DB (`text` columns), JSON DTOs, and
  zod schemas are untouched and the existing test assertions stayed as the
  regression net. The hand-rolled DST resolver (`tzOffsetMs` double-offset dance)
  and the `new Date(\`${day}T00:00:00Z\`)` + `timeZone:'UTC'` UI idiom are gone —
  `PlainDate` has no zone, so date-only labels can't shift.
- [x] **`Date` eliminated everywhere** in app/server/shared (audit stamps, token
  expiry, rollover, rate-limit window, S3 `x-amz-date`, the owner-tz ticker) and in
  test fixtures. `instantToIso` pins millisecond precision so ISO output stays
  byte-identical to the old `toISOString()`. `Intl.supportedValuesOf('timeZone')`
  stays for the tz allowlist (Temporal has no zone-list API).

## UX polish — done

- [x] **Dashboard task-progress badge.** The home pet cards show each pet's
  done/total care tasks for today (`TaskProgressBadge.vue` with a fill bar), so a
  fully-completed pet reads as "All Done!" instead of a blank badge. The pets-list
  endpoint returns both `todayTaskCount` (open) and `todayCompletedCount`.
- [x] **Photo upload when creating a pet.** `PetImagePicker` now holds the chosen
  file with a local preview during create and `PetForm` uploads it right after the
  pet is created (edit still uploads immediately) — no more "add a photo after
  saving" gap.
