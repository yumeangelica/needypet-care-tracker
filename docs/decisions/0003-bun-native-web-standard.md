# 0003 — Bun-native + Web-standard: no node:crypto, no Node runtime

**Status**: Accepted

## Context

A dependency audit asked, for each dependency, whether the runtime already
covers it. Bun ships batteries (SQLite driver, password hashing, file I/O)
and the Web platform covers crypto — most of the Node-flavoured deps were
redundant.

## Decision

Go Bun-native and Web-standard end to end: `bun:sqlite` (DB), `Bun.password`
argon2id (hashing — replaced `bcryptjs`; legacy bcrypt hashes still verify
and rehash on login), `Bun.write`/`Bun.file` (uploads), Web Crypto
(`getRandomValues`, `subtle.digest`, HMAC SigV4 signing) for tokens and R2 —
**no `node:crypto` anywhere in app code**. Removed in the same pass:
`happy-dom`, `clsx`, `tailwind-merge`, `better-sqlite3`, `tsx`, `postgres`,
explicit `vue-router`. Kept: `@lucide/vue` (tree-shakes to used icons).
Node's `fs`/`path` remain acceptable for path handling and directory
creation (`node:fs`, `node:path`).

## Consequences

- No Node runtime required; tests, scripts and the server all run under Bun
  (Nitro preset `bun`).
- The `node:crypto` ban is machine-checked by
  `tests/unit/guardrails.spec.ts`.
- New dependencies need explicit justification — first ask whether Bun or
  the Web platform already provides it.
