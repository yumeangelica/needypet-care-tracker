# 0006 — Store-free client state: no Pinia, server is source of truth

**Status**: Accepted

## Context

Care data is multi-user and permission-sensitive: an owner and several
caretakers mutate the same pet's day concurrently, and rollover changes data
on the server without any client action. A client-side store would cache
exactly the data that must stay fresh.

## Decision

No Pinia, no `defineStore`, no global `useState`. State management is Nuxt
built-ins only: `useUserSession()` (nuxt-auth-utils) for auth state,
`useFetch`/`$fetch` for server data with refresh after mutations, and
component-local `ref`/`reactive` for form state. The service worker never
caches API responses for the same reason (Workbox denylist).

## Consequences

- No cache-invalidation logic, no stale-permission bugs, no store/API drift.
- Pages re-fetch rather than patch local copies — acceptable at this app's
  scale; revisit only with measured evidence that re-fetching hurts.
- Guardrails (`tests/unit/guardrails.spec.ts`) fail on any `pinia` /
  `defineStore` import. Do not add a store to "clean up" data flow — the
  absence is the design.
