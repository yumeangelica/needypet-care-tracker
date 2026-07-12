# 0011 — Cloudflare R2 (S3 REST, no SDK) for prod photos; local disk dev

**Status**: Accepted

## Context

Pet photos need durable storage: on most hosts the container disk is
ephemeral, so local files vanish on redeploy. An earlier iteration used
Supabase storage; its free tier pauses on inactivity and egress is metered.
Pulling in the AWS SDK for simple object PUT/DELETE would contradict the
dependency ethos ([ADR-0003](0003-bun-native-web-standard.md)).

## Decision

One storage abstraction (`server/utils/imageStorage.ts`) with two providers,
switched by `NUXT_UPLOADS_PROVIDER`:

- **local** (dev default): `Bun.write` under `NUXT_UPLOADS_DIR`, served by
  the traversal-safe `/uploads/[...path]` route;
- **r2** (production): Cloudflare R2 through its S3-compatible REST API,
  requests signed with AWS SigV4 implemented on Web Crypto HMAC — **no SDK**.
  R2 free tier: 10 GB, zero egress, no inactivity pause. All five
  `NUXT_UPLOADS_R2_*` vars must be set or the first upload throws — never a
  silent fallback to ephemeral disk.

The bucket is **public** for reads: keys embed an unguessable UUID
(`pets/<petId>/<uuid>.<ext>`), matching the unauthenticated local `/uploads`
route, and `publicUrl()` stays synchronous by design (signed expiring URLs
are out of scope). Uploads are magic-byte validated (JPEG/PNG/WebP) and
size-capped (5 MB) before storage; writes/deletes happen server-side only.

## Consequences

- Free, durable, egress-free photo hosting; dev needs no cloud account.
- A leaked photo URL stays readable until the photo is replaced/deleted —
  accepted for pet photos; nothing else may go in the bucket.
- Setup steps live in [`../deployment.md`](../deployment.md).
