# 0010 — Exactly one measurement, enforced at three layers

**Status**: Accepted

## Context

Legacy NeedyPet allowed a need to be measured by duration *or* quantity, and
records log partial progress against that measure. If a need could carry
both (or neither), completion arithmetic and the stats page would have no
single answer for "how much of this is done".

## Decision

Every need and every care record has **exactly one** measurement shape:
duration (1–1440, unit `minutes`) or quantity (≥ 1, unit `ml` | `g`). A
record must match its parent need's type. Enforced at three layers so no
single bypass can corrupt data:

1. **zod** — `superRefine` with `hasExactlyOneMeasurement` in
   `shared/schemas/need.ts` / `careRecord.ts` (client forms + API boundary);
2. **database** — CHECK constraints on both tables
   (`…_exactly_one_measurement`, unit allowlists) in
   `server/db/schema.sqlite.ts`;
3. **domain rules** — `measurementTypesMatch` in
   `shared/utils/measurement.ts`, used by `careRules.ts` on every record
   write.

## Consequences

- Completion can always be computed as sum-of-records vs the need's value
  (`shared/utils/records.ts`); stats aggregate cleanly per unit.
- The need-update schema may omit the measurement (server carries the
  existing one over) but still rejects both types at once.
- Adding a new measurement kind (or unit) means touching all three layers
  plus the migration set — a spec-first change, never a quick edit.
