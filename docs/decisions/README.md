# Architecture decision records

Retrospectively documented 2026-07-12; the decisions themselves were made and
shipped earlier (rationale preserved from the working notes). One decision per
file: **Status / Context / Decision / Consequences**. New ADRs: next number,
same format, linked from this index and from
[`../architecture.md`](../architecture.md#invariants) when they add an
invariant.

Changing a decision means a new ADR that supersedes the old one (mark the old
`Superseded by NNNN`) — not silently drifting away from it.

| ADR | Decision |
| --- | --- |
| [0001](0001-nuxt-monolith-rebuild.md) | Nuxt 4 monolith with server routes as the only API |
| [0002](0002-sqlite-only-single-dialect.md) | SQLite only: bun:sqlite dev, libSQL/Turso prod, one schema |
| [0003](0003-bun-native-web-standard.md) | Bun-native + Web-standard: no node:crypto, no Node runtime |
| [0004](0004-temporal-behind-seam.md) | Temporal API behind one seam module; strings at every boundary |
| [0005](0005-cookie-sessions-no-jwt.md) | Sealed cookie sessions (nuxt-auth-utils), no JWTs |
| [0006](0006-store-free-client-state.md) | Store-free client state — no Pinia, server is source of truth |
| [0007](0007-plain-vue-i18n.md) | Plain vue-i18n plugin with session-derived locale |
| [0008](0008-owner-timezone-care-day.md) | Owner-timezone care day; date-only strings; UTC record instants |
| [0009](0009-lazy-rollover.md) | Lazy on-read daily rollover, idempotent, no backfill |
| [0010](0010-single-measurement-three-layers.md) | Exactly one measurement, enforced at three layers |
| [0011](0011-r2-image-storage.md) | Cloudflare R2 (S3 REST, no SDK) for prod photos; local disk dev |
| [0012](0012-error-message-key-localization.md) | English API messages + i18n `messageKey` for localization |
| [0013](0013-revocable-sealed-cookie-sessions.md) | Revocable sealed-cookie sessions via a per-user version |
| [0014](0014-bounded-single-measurements.md) | Exactly one bounded measurement per need and care record |
