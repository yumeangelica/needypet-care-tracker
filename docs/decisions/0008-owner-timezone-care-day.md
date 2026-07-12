# 0008 — Owner-timezone care day; date-only strings; UTC record instants

**Status**: Accepted

## Context

A pet's "care day" must mean the same thing to everyone involved, even when
the owner is in Helsinki and a caretaker logs a feeding from New York. Using
each viewer's local day would make needs appear and disappear per viewer;
storing date-only values as timestamps invites off-by-one-day shifts through
timezone conversion.

## Decision

Two kinds of time, never mixed:

- **Date-only values** (need `dateFor`, pet `birthday`,
  `lastRolledNeedDate`, `lastDigestDate`) are `YYYY-MM-DD` TEXT on the **pet
  owner's** local day (digest: the user's own day), compared as strings —
  lexicographic order is chronological order. They are never shifted through
  any timezone.
- **Care record `date`** is a full UTC ISO instant (when the care actually
  happened); the acting user's IANA timezone is stored alongside for audit
  only and is never used in computation.

The care day is **always the owner's timezone**: record creation validates
against the owner's current day even when a caretaker elsewhere logs it.

## Consequences

- Everyone sees the same care day; history groups stably.
- Every handler that needs "today" must resolve it in the owner's timezone
  (`todayInTimeZone(ownerTimezone)`), never the machine's or the viewer's —
  the classic bug near UTC midnight. Tests compute owner-local dates for the
  same reason.
- Rollover ([ADR-0009](0009-lazy-rollover.md)) and the digest both build on
  this contract; the seam helpers live in `shared/utils/{date,datetime}.ts`
  ([ADR-0004](0004-temporal-behind-seam.md)).
