# Domain model

The entities, relationships and business rules of NeedyPet. The schema is
`server/db/schema.sqlite.ts`; domain DTOs are `shared/types/domain.ts`;
the pure rule functions live in `shared/utils/`.

## Entities

```
users ──1:N──► pets ──1:N──► needs ──1:N──► care_records
  │              ▲             ▲                │
  └──N:M────────┘              │                │
     (pet_caretakers)          │                │
  └──◄─────────── care_records.care_taker_id ───┘ (SET NULL on user delete)
       pets ──1:N──► care_records (denormalized pet_id)
       pets ──1:N──► need_schedules ──1:N──► needs.schedule_id
                                             (SET NULL on rule delete)
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

### `need_schedules`

A recurrence rule ([ADR-0015](decisions/0015-recurring-need-schedules.md)):
`petId` → pets (cascade), the template fields (`category`, `description`, one
measurement with the same CHECKs as needs), `recurrenceType`
(`daily | interval | weekly`), `intervalDays` (interval only, 2–365),
`weekdays` (weekly only, CSV of ISO weekday numbers, `'1,4'` = Mon+Thu),
`anchorDate` (owner-local date-only, the fixed interval rhythm zero),
`isActive` (paused = false: no new instances until resumed).

### `needs`

One care task **instance** on one care day: `petId` → pets (cascade),
`scheduleId` → need_schedules (**SET NULL** on rule delete so frozen history
survives; NULL = one-off or legacy history), `dateFor` (owner-local
`YYYY-MM-DD`), `category` (3–50 chars), `description` (≤1000),
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
| Create / edit / delete / pause needs (and their recurrence rules) | ✔ | ✘ |
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
parity — pausing only suspends future occurrences of the rule, ADR-0015).

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

## Recurrence rules (need schedules)

A need instance (`needs` row, one per owner-local day) is materialized from a
**recurrence rule** (`need_schedules` row) —
[ADR-0015](decisions/0015-recurring-need-schedules.md):

- Rule kinds: `daily`, `interval` (every N days, 2–365, **fixed anchor**:
  due when `daysBetween(anchorDate, today) % N === 0`; missed days never
  shift the rhythm), `weekly` (ISO weekday set). A create-time `once` choice
  makes a schedule-less instance that archives at rollover and never returns.
- The rule carries the template (category, description, one bounded
  measurement); its instances denormalize those fields per day.
- **Pause** flips `need_schedules.is_active`: no new instances until resumed,
  the rule survives indefinitely. Today's live instance mirrors the state and
  still accepts records. Resuming on a due day materializes today's instance
  immediately (cap-checked).
- Editing a scheduled instance edits the RULE and mirrors onto today's live
  instance; a real rule change re-anchors `anchorDate` to the owner-local
  today. Deleting a scheduled instance (or the rule from the rules list)
  removes the rule and its live instances; **archived history rows survive**
  with `schedule_id` set NULL by the FK.
- The pet page shows the owner a rules list (active + paused) — the only
  handle on a paused weekly/interval rule between its due days.
- Existing data: migration `0005` created one `daily` rule per distinct live
  template (grouped per pet by the seven identity columns) and pointed the
  live instances at it, so pre-0015 pets behave identically.

## Daily rollover

Lazy, on-read, owner-local ([ADR-0009](decisions/0009-lazy-rollover.md),
template model amended by [ADR-0015](decisions/0015-recurring-need-schedules.md)).
Pure plan in `shared/utils/rollover.ts` (`computeRollover`), applied
transactionally by `server/utils/rollover.ts` (`rollPetNeedsIfDue`) from the
pet GET endpoints:

- every open (non-archived) instance left on a past day is archived — paused
  ones and one-offs included;
- each **active** schedule that is **due today** (`isScheduleDueOn`,
  `shared/utils/recurrence.ts`) materializes one fresh instance, de-duplicated
  by `schedule_id`: skipped when today already has a live instance of the
  same rule;
- paused schedules produce nothing; one-offs are never re-created;
- missed in-between days are **not** backfilled — archived copies could never
  receive records, so an empty past day is the honest history;
- today never exceeds `MAX_NEEDS_PER_DAY` live instances: schedules
  materialize oldest-first and excess due rules skip to their next due day.

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
