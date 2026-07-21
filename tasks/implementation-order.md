# Implementation order

Recommended sequence for the open items in [`backlog.md`](backlog.md) — a
recommendation (cheap/safe first, invariant-touching later behind specs), not
a commitment. Reorder freely; keep `backlog.md` as the single list of *what*,
this file only orders it. Items marked **spec-first** need a confirmed spec
(`specs/SPEC_TEMPLATE.md`) before any code, because they touch documented
invariants.

| # | Item | Why here | Spec-first? |
| --- | --- | --- | --- |
| 1 | Zod schemas for query params | Tiny consistency fix; zero product risk | no |
| 2 | Localized confirmation/reset emails | Small; the digest already has the localization pattern (`shared/utils/digest.ts`, `server/utils/mailer.ts`) | no |
| 3 | Care task templates (quick-add walk/feed/meds) | Small UI + shared constants; no schema risk | no |
| 4 | "Skip today" for a recurring task | Small instance-route addition on the shipped ADR-0015 model | no |
| 5 | Localized pet species/category presets | i18n-only; presets vs user-authored split already exists | no |
| 6 | Accessibility audit (locale picker, recurrence picker, rules list, WCAG 2.2 AA) | Quality pass, no architecture risk; manual verification heavy | no |
| 7 | Component/E2E tests | Raises the safety net for everything below; remember to block the service worker (prod builds) | no |
| 8 | Per-need history charts on stats | Extends `shared/utils/stats.ts` + stats page; read-only feature | no |
| 9 | Orphaned upload sweep | Small storage hygiene task; needs care with R2 listing | no |
| 10 | AI care assistant (chat with pet context) | New external seam, but design + spec are already confirmed (ADR-0016) | **yes** (spec exists: `ai-care-assistant.md`) |
| 11 | AI weekly summary / AI need suggestions | Follow-up layers on the ADR-0016 seam once the assistant ships | no (reuse ADR-0016) |
| 12 | Caretaker invites by email/link | New token flow + auth surface; rate limiting + no-oracle rules apply | **yes** (security-model) |
| 13 | Access-controlled pet photos (signed URLs) | Changes the documented image trust model | **yes** (ADR-0011) |
| 14 | Multiple photos per pet / gallery | Schema + storage + UI change | **yes** (ADR-0011) |
| 15 | Push notifications for the digest | Biggest: SW messaging, subscription storage, digest fan-out | **yes** |
| — | TypeScript 7 | Blocked on vue-tsc / Vue tooling; do nothing until the toolchain catches up | — |

Shipped from this list: recurring/scheduled needs (ADR-0015,
`specs/feature-specs/recurring-needs.md`) and the durable rate-limit store.

When an item ships: tick its checkbox in `backlog.md`, and update any
`docs/` file whose description it changed.
