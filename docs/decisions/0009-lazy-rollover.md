# 0009 — Lazy on-read daily rollover, idempotent, no backfill

**Status**: Accepted — template model amended by [0015](0015-recurring-need-schedules.md) (schedules replace copy-forward as the source of today's copies; lazy/idempotent/no-backfill unchanged)

## Context

Daily needs must move forward each day (yesterday's feeding task appears
again today), but a cron-driven rollover needs infrastructure, must iterate
every pet in every timezone every hour, and still races user reads. This app
targets free-tier hosting with minimal moving parts.

## Decision

Rollover is **lazy**: it fires on pet reads (`rollPetNeedsIfDue`,
`server/utils/rollover.ts`) using the owner's local day. The pure plan
(`computeRollover`, `shared/utils/rollover.ts`): archive every open past-day
need (paused included); create one fresh copy of each **active** past need
for today, de-duplicated by template key and skipped when today already has a
live equivalent; paused needs stay put; missed in-between days are **not**
backfilled (archived copies could never receive records — an empty past day
is the honest history).

Idempotency: `pets.lastRolledNeedDate`, compared with `>=` (not `===`, so an
owner moving to an earlier timezone stays quiet), re-read inside the
transaction so a concurrent request no-ops, and stamped even when nothing
rolled so later same-day reads take the fast path.

## Consequences

- No scheduler needed; a pet nobody looks at rolls the moment someone looks.
- Archived (rolled-over) days are **frozen** — the permission layer rejects
  any mutation on them.
- Changes to rollover semantics are high-risk: they touch the idempotency
  guard, the dedup key and the date contract
  ([ADR-0008](0008-owner-timezone-care-day.md)) at once. Write a spec first
  and lean on `rollover.spec.ts` (unit + integration).
- The recurring-needs backlog item (e.g. "every Mon/Thu") must extend the
  template model here, not bypass it.
