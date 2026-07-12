# Implementation order

Recommended sequence for the open items in [`backlog.md`](backlog.md) — a
recommendation (cheap/safe first, invariant-touching later behind specs), not
a commitment. Reorder freely; keep `backlog.md` as the single list of *what*,
this file only orders it. Items marked **spec-first** need a confirmed spec
(`specs/SPEC_TEMPLATE.md`) before any code, because they touch documented
invariants.

| # | Item | Why here | Spec-first? |
| --- | --- | --- | --- |
| 1 | Localized confirmation/reset emails | Small; the digest already has the localization pattern (`shared/utils/digest.ts`, `server/utils/mailer.ts`) | no |
| 2 | Care task templates (quick-add walk/feed/meds) | Small UI + shared constants; no schema risk | no |
| 3 | Localized pet species/category presets | i18n-only; presets vs user-authored split already exists | no |
| 4 | Accessibility audit (locale picker, Finnish copy, WCAG 2.2 AA pass) | Quality pass, no architecture risk; manual verification heavy | no |
| 5 | Component/E2E tests | Raises the safety net for everything below; remember to block the service worker (prod builds) | no |
| 6 | Per-need history charts on stats | Extends `shared/utils/stats.ts` + stats page; read-only feature | no |
| 7 | Recurring/scheduled needs ("every Mon/Thu") | Touches rollover template semantics — highest-risk domain change | **yes** (ADR-0009) |
| 8 | Caretaker invites by email/link | New token flow + auth surface; rate limiting + no-oracle rules apply | **yes** (security-model) |
| 9 | Multiple photos per pet / gallery | Schema + storage + UI change | **yes** (ADR-0011) |
| 10 | Push notifications for the digest | Biggest: SW messaging, subscription storage, digest fan-out | **yes** |
| 11 | Durable rate-limit store | Only needed before scaling past one instance; slots in behind `createRateLimiter()` | no |
| — | TypeScript 7 | Blocked on vue-tsc / Vue tooling; do nothing until the toolchain catches up | — |

When an item ships: tick its checkbox in `backlog.md`, and update any
`docs/` file whose description it changed.
