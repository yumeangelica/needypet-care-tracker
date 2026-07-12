# 0001 — Nuxt 4 monolith with server routes as the only API

**Status**: Accepted

## Context

NeedyPet's first version is a three-piece stack: Vue/Vite SPA + Express API +
MongoDB (kept read-only next door at `../needypet` as reference). Running and
evolving three pieces is heavy for a solo-maintained portfolio app, and the
SPA/API split forces duplicated types, duplicated validation and CORS
ceremony.

## Decision

Rebuild as a single Nuxt 4 application. Nuxt server routes (Nitro) are the
entire backend — no separate API server, no separate deployment. Client and
server share code through `shared/` (`#shared` alias): zod schemas, domain
types and pure utilities run identically on both sides.

## Consequences

- One codebase, one build, one deploy; SSR and PWA come from the same app.
- Shared zod schemas give the client and API identical validation for free.
- Backend logic must stay in `server/` — resist any future "extract a
  service" impulse unless requirements genuinely outgrow Nitro.
- Session-cookie auth fits naturally (same origin); see
  [ADR-0005](0005-cookie-sessions-no-jwt.md).
