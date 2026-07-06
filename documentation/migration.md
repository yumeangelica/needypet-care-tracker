# Migration contract: legacy NeedyPet → this app

The legacy app (Vue/Vite + Express + MongoDB) hands data over through a
**versioned JSON export bundle** — never a direct Mongo import. This app's
validating importer exists: `bun run db:import <bundleDir> [--dry-run]`
(`server/db/import-legacy.ts`, validation in `server/db/import/validate.ts`).
The legacy repo's read-only export script producing the bundle does not exist
yet; this document is the agreed contract between them.

Every table in this app's schema carries a nullable, unique `legacy_id` column
so imported rows stay traceable to their Mongo `_id`s.

## Bundle layout

A directory (or archive) containing:

```
manifest.json
users.json
pets.json
pet_caretakers.json
needs.json
care_records.json
```

### manifest.json

```jsonc
{
  "formatVersion": 1,
  "exportedAt": "2026-07-05T12:00:00.000Z", // UTC ISO
  "source": "needypet-mongo",
  "counts": { "users": 0, "pets": 0, "petCaretakers": 0, "needs": 0, "careRecords": 0 }
}
```

Counts must equal the row counts of each file; a mismatch aborts the import.

### users.json

```jsonc
[{
  "legacyId": "mongo-object-id",
  "userName": "…",
  "email": "…",              // lowercased on import
  "passwordHash": "$2b$10$…", // bcrypt salt-10, imported verbatim (login keeps working)
  "emailConfirmed": true,
  "timezone": "Europe/Helsinki", // IANA
  "createdAt": "…", "updatedAt": "…" // UTC ISO
}]
```

Pending confirm/reset tokens are NOT exported (short-lived secrets).

### pets.json

```jsonc
[{
  "legacyId": "…",
  "ownerLegacyId": "…",       // -> users.legacyId
  "name": "…", "species": "…", "breed": "…", "description": "…",
  "birthday": "2021-05-14",    // date-only or null
  "image": { "source": "preset", "key": "dog" }, // key in dog|cat|bunny
  "lastRolledNeedDate": "2026-07-05", // date-only or null
  "createdAt": "…", "updatedAt": "…"
}]
```

### pet_caretakers.json

```jsonc
[{ "petLegacyId": "…", "userLegacyId": "…" }]
```

### needs.json

```jsonc
[{
  "legacyId": "…",
  "petLegacyId": "…",
  "dateFor": "2026-07-05",     // date-only, owner-local care day
  "category": "…", "description": "…",
  // exactly one of:
  "duration": { "value": 30, "unit": "minutes" },
  "quantity": { "value": 200, "unit": "ml" },  // unit ml|g
  "completed": false, "archived": false, "isActive": true,
  "createdAt": "…", "updatedAt": "…"
}]
```

The legacy `frequency` sub-schema is dead/reserved and is NOT exported.

### care_records.json

```jsonc
[{
  "legacyId": "…",
  "needLegacyId": "…",
  "petLegacyId": "…",
  "careTakerLegacyId": "…",    // may be null if the account no longer exists
  "date": "2026-07-05T08:30:00.000Z", // full UTC ISO timestamp
  "note": "…",
  // exactly one measurement, matching the parent need's type:
  "quantity": { "value": 100, "unit": "g" },
  "timezone": "Europe/Helsinki", // acting user's IANA zone (audit)
  "createdAt": "…"
}]
```

## Import order

users → pets → pet_caretakers → needs → care_records
(each stage resolves `*LegacyId` references against the previous stages).

## Consistency checks (import aborts on any failure)

- manifest counts match file row counts; `formatVersion` supported.
- Every pet's `ownerLegacyId` resolves to an imported user.
- Every caretaker relation resolves to a real pet AND a real user; the owner
  is never their own caretaker.
- Every need's `petLegacyId` resolves; every care record's `needLegacyId`
  and `petLegacyId` resolve (and agree with each other).
- All date-only fields (`birthday`, `dateFor`, `lastRolledNeedDate`) are valid
  `YYYY-MM-DD` calendar dates (`isValidDateOnly`).
- All timestamps (`date`, `createdAt`, `updatedAt`) parse as valid UTC ISO.
- Every `timezone` is a supported IANA identifier (`isSupportedTimeZone`).
- Preset images use `source: "preset"` and key in `dog|cat|bunny`.
- Every need and care record has **exactly one** measurement shape
  (`hasExactlyOneMeasurement`), with valid units and value ranges.
- Every care record's measurement type matches its parent need's
  (`measurementTypesMatch`).
- No duplicate `legacyId` within a file; `userName`/`email` unique.

The referenced validators already exist in `shared/utils/date.ts` and
`shared/utils/measurement.ts` and are unit-tested.
