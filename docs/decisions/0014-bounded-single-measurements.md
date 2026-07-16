# 0014 — Exactly one bounded measurement per need and care record

**Status**: Accepted

Supersedes [ADR-0010](0010-single-measurement-three-layers.md).

## Context

ADR-0010 established one duration or quantity measurement per need and care
record, but quantity had no upper bound. Extremely large finite numbers could
complete a care task immediately and distort statistics.

## Decision

Every need and care record has exactly one measurement shape:

- duration: 1–1,440 minutes, unit `minutes`; or
- quantity: 1–100,000, unit `ml` or `g`.

The shared Zod measurement schemas enforce the numeric bounds for browser/API
input and for the legacy importer. Exactly-one shape and unit validity remain
enforced by Zod, SQLite CHECK constraints, and shared domain rules. A care
record must still match its parent need's measurement type.

## Consequences

- Completion and statistics operate on bounded finite values.
- Existing stored values are not rewritten; no production database exists at
  the time of this decision.
- A new measurement kind, unit, or bound requires an explicit decision update,
  shared validation changes, migration review, and regression tests.
