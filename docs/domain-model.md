# Domain model

The entities, relationships and business rules of NeedyPet. The schema is
`server/db/schema.sqlite.ts`; domain DTOs are `shared/types/domain.ts`;
the pure rule functions live in `shared/utils/`.

## Entities

```
users ──1:N──► pets ──1:N──► needs ──1:N──► care_records
  │              ▲                              │
  └──N:M────────┘ (pet_caretakers)              │
  └──◄─────────── care_records.care_taker_id ───┘ (SET NULL on user delete)
       pets ──1:N──► care_records (denormalized pet_id)
```

Schema conventions (any SQLite host behaves identically):

- TEXT UUID primary keys (`crypto.randomUUID()`)
- date-only values as TEXT `YYYY-MM-DD`, compared as strings
- timestamps as TEXT ISO-8601 UTC
- `integer({ mode: 'boolean' })` for booleans
- every table keeps a nullable, unique `legacy_id` for Mongo import
  traceability (see [`migration.md`](migration.md))

### `users`

Account + settings: `userName` (international display spelling) plus internal
`userNameKey` (NFKC + Unicode lowercase, uniquely indexed for login and
caretaker lookup), `email` (unique), `passwordHash`
(argon2id; imported legacy hashes are bcrypt until rehash-on-login),
`emailConfirmed` + confirm token/expiry, password-reset token/expiry,
`sessionVersion` (revokes stale sealed cookies), `timezone` (IANA string,
required), `locale` (`'en'` default | `'fi'`),
`digestOptIn` (default false), `lastDigestDate` (YYYY-MM-DD user-local,
stamped on a sent digest).

### `pets`

`ownerId` → users (**cascade delete**: deleting an account deletes its pets),
`name`, optional `species`/`breed`/`description`, `birthday` (owner-local
date-only, never in the future), image fields (`imageSource` `'preset'`
default, `imageKey` default `'cat'`, `imageUrl`/`imageStorageKey` for
uploads), `lastRolledNeedDate` (rollover idempotency guard).

Pet images: presets `dog | cat | bunny` (unknown values coerce to `cat` via
`normalizePetImage` in `shared/utils/petImages.ts`) or an uploaded
JPEG/PNG/WebP (magic-byte validated, `shared/utils/imageValidation.ts`).
Adding an image source requires client + server changes.

### `pet_caretakers`

Pure join table with composite PK `(petId, userId)`, both cascading. This is
the entire sharing model — a row means that user is a caretaker of that pet.
Caretakers are added by username (they must already have an account).

### `needs`

One care task on one care day: `petId` → pets (cascade), `dateFor`
(owner-local `YYYY-MM-DD`), `category` (3–50 chars), `description` (≤1000),
one measurement (below), `completed`, `archived`, `isActive` (paused = false).

DB CHECK constraints mirror the zod rules: exactly one measurement present;
`duration_unit` only `'minutes'`; `quantity_unit` only `'ml' | 'g'`.

At most **10 non-archived needs per pet per day** (`MAX_NEEDS_PER_DAY` in
`shared/schemas/need.ts`, shared by API and UI). On update, `dateFor` is
immutable and the measurement may be omitted (the server carries over the
existing one) — but sending both types is rejected.

### `care_records`

Append-mostly audit log of care given: `needId` → needs (cascade), `petId` →
pets (cascade, **denormalized** so the diary/stats/streak queries never join
through needs — indexed `(pet_id, date)`), `careTakerId` → users (**SET NULL**
on account delete so the audit row survives; the UI shows "deleted account"),
`date` (full UTC ISO instant of the care), optional `note`, one measurement,
`timezone` (the acting user's IANA tz — audit only, never used in
computation).

## Measurements — exactly one shape

Every need and every care record has **exactly one** measurement
([ADR-0014](decisions/0014-bounded-single-measurements.md)):

- **duration**: 1–1440 minutes, unit `minutes`, or
- **quantity**: 1–100,000, unit `ml` or `g`.

A record must match its parent need's measurement type
(`measurementTypesMatch`, `shared/utils/measurement.ts`). Records may be
partial (e.g. 20 of 60 minutes); completion is computed from the sum of a
need's records (`shared/utils/records.ts`). Enforced at three layers: zod
`superRefine` (client + server), DB CHECK constraints, and the shared rule
functions.

## Permissions

Guards: `requirePetOwner` / `requirePetAccess` (`server/utils/petAccess.ts`);
record rules: `shared/utils/careRules.ts`. Missing pet → 404; existing pet
without permission → 403.

| Action | Owner | Caretaker |
| --- | --- | --- |
| View pet, needs, records, stats | ✔ | ✔ (assigned pets only) |
| Create / edit / delete pet | ✔ | ✘ |
| Manage pet image | ✔ | ✘ |
| Add / remove caretakers | ✔ | self-removal only |
| Create / edit / delete / pause needs | ✔ | ✘ |
| Add care record (owner's **current** care day only) | ✔ | ✔ |
| Edit / delete a care record | ✔ (any record) | own records only |
| Anything on an archived (rolled-over) day | ✘ frozen | ✘ frozen |

Record-creation rejections run in the legacy backend's order
(`validateRecordAgainstNeed`): `completed` → `archived` →
`measurement-mismatch` → `not-today`. Mutating an existing record
(`validateRecordMutation`) rejects only `archived` and
`measurement-mismatch` — a **completed need does not block mutation**,
because undoing an accidental "All Done!" is the point; completion is
recomputed afterwards. A **paused need still accepts records** (legacy
parity — pausing only stops tomorrow's rollover).

## Dates and timezones

The full rationale is [ADR-0008](decisions/0008-owner-timezone-care-day.md);
the seam utilities are `shared/utils/{date,datetime}.ts`.

- **Date-only values** (`birthday`, need `dateFor`, `lastRolledNeedDate`,
  `lastDigestDate`) are `YYYY-MM-DD` strings on the **pet owner's** local day
  (digest: the user's own day), compared lexicographically (=
  chronologically) — never shifted through a browser timezone.
- **Care record `date`** is a full UTC ISO instant; the acting user's
  timezone is stored alongside for audit only.
- **The care day is always the owner's timezone**, even when a caretaker in
  another timezone logs the record.
- Temporal is internal to computation only ([ADR-0004](decisions/0004-temporal-behind-seam.md));
  everything at a storage/JSON/zod seam is a string.
- Caveat: never validate a `?? 'UTC'` fallback through `isSupportedTimeZone`
  — whether `Intl.supportedValuesOf('timeZone')` lists `UTC` is ICU/runtime-
  dependent. The existing `?? 'UTC'` fallbacks are dead paths anyway (a live
  pet always has an owner row, thanks to the cascade).

## Daily rollover

Lazy, on-read, owner-local ([ADR-0009](decisions/0009-lazy-rollover.md)).
Pure plan in `shared/utils/rollover.ts` (`computeRollover`), applied
transactionally by `server/utils/rollover.ts` (`rollPetNeedsIfDue`) from the
pet GET endpoints:

- every open (non-archived) need left on a past day is archived — paused ones
  included;
- each **active** past need acts as a daily template: one fresh copy is
  created for today, de-duplicated by template key
  (`needTemplateKey`) and skipped when today already has a live need with the
  same template;
- paused (`isActive: false`) needs stay on their day and do not roll forward;
- missed in-between days are **not** backfilled — archived copies could never
  receive records, so an empty past day is the honest history.

Idempotency: `pets.lastRolledNeedDate` is compared with `>=` (not `===`, so a
move to an earlier timezone that steps "today" backwards stays quiet), and the
guard is re-read inside the transaction so a second near-simultaneous request
no-ops. The guard is stamped even when nothing rolled, keeping later same-day
reads on the fast path.

## Lifecycle quirks worth knowing

- Undoing a completed need is allowed; completion is recomputed from records.
- Register relies on DB defaults for `locale`/`digestOptIn` and echoes the
  literal `'en'` into the session (the insert object has no locale field).
- Deleting an account cascades pets → needs → records, but records the user
  wrote *on other people's pets* survive with `careTakerId = NULL`.
- The digest email is localized to the recipient's locale;
  confirmation/reset emails are English (backlog item to localize).
