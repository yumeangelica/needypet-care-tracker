# 0015 — Recurring needs via first-class schedules; instances stay per-day rows

**Status**: Accepted (amends [0009](0009-lazy-rollover.md))

## Context

The daily copy-forward rollover (ADR-0009) can only express "repeat every
day". Real care plans need "medicine every Monday", "feed every 2nd day" and
one-off tasks. ADR-0009 already required that recurring needs extend the
template model rather than bypass it. Two candidate designs: recurrence
columns on `needs` with future-dated copies, or a separate schedules table.
Future-dated copies would leak template state into the per-day instance
table, weaken the frozen-archived-past invariant and complicate the
`needTemplateKey` dedup identity.

## Decision

Recurrence rules become **first-class rows** in a new `need_schedules` table
(category, description, one bounded measurement, `recurrence_type`
`daily | interval | weekly`, `interval_days`, `weekdays` CSV of ISO weekday
numbers, `anchor_date`, `is_active`). `needs` stays a pure per-day instance
table and gains one nullable `schedule_id` FK (`ON DELETE SET NULL`, so
deleting a rule never rewrites frozen history).

Rollover keeps every ADR-0009 property (lazy on-read, idempotent via
`pets.lastRolledNeedDate`, archive-all-past, **no backfill**). What changes is
where today's copies come from: instead of copying yesterday's rows, the pure
planner asks each **active schedule** whether it is due today
(`isScheduleDueOn`, `shared/utils/recurrence.ts`) and creates one instance per
due schedule, de-duplicated by `schedule_id` instead of `needTemplateKey`.
Interval rhythm uses a **fixed anchor**: due when
`daysBetween(anchorDate, today) % intervalDays === 0` — missed days never
shift the rhythm, and a timezone move cannot re-anchor it. All weekday and
day-difference math goes through the Temporal seam (ADR-0004) in the owner's
timezone (ADR-0008).

Pausing flips `need_schedules.is_active`: a paused rule produces no new
instances but survives indefinitely and can be resumed (previously, pausing
killed the template at the next rollover). One-off tasks are instances with
`schedule_id NULL` — they archive at rollover and never return.

Existing data migrates in SQL: each distinct live template (per pet, grouped
by the template identity columns) becomes one `daily` schedule and its live
instances point to it, so existing pets behave identically with zero user
action.

## Consequences

- `needTemplateKey` survives only as the migration's grouping identity; the
  runtime dedup key is `schedule_id`.
- The per-day cap (`MAX_NEEDS_PER_DAY`) is now also enforced inside the
  planner (schedules ordered by `created_at`; excess due schedules skip that
  day), since many weekly rules can converge on one weekday.
- A paused schedule has no instance on most days, so the pet page needs a
  rules view; instance cards alone can no longer reach every schedule.
- Instance mutations on a scheduled need act on the **schedule** (edit
  propagates, delete removes rule + today's instance) to preserve the
  pre-0015 mental model of "editing the task changes it from now on".
- Rollover semantics stay spec-first territory; `rollover.spec.ts` (unit +
  integration) and `recurrence.spec.ts` guard this ADR.
