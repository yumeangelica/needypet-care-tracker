# 0016 — AI care assistant behind a provider seam, off by default

**Status**: Proposed (design + spec ready; implementation is a backlog item)

## Context

A pet-care chat assistant ("my cat vomited, what should I watch for?") is
genuinely useful when it can see the pet's own context: species, age, today's
tasks, the last days of care records. That requires an external LLM API — the
first outbound dependency that would receive user-generated content, so the
privacy and failure boundaries matter more than the feature itself.

## Decision

- **Provider seam, no SDK.** OpenAI-compatible chat-completions API called
  with plain `fetch` and an injectable fetch for tests — the exact pattern of
  the Resend mailer and R2 storage (ADR-0003). Config block
  `runtimeConfig.ai = { provider, apiKey, model, apiUrl, maxOutputTokens }`
  driven by `NUXT_AI_*` env vars. An empty provider disables the feature
  (mailer pattern): the route answers 404 and the UI hides the entry point.
- **One route, standard pipeline.** `POST /api/pets/:petId/assistant` —
  `requireAppUser` → `requirePetAccess` (caretakers may ask too) →
  per-user `checkRateLimit` (per-minute and per-day counters; tokens cost
  money) → `readValidatedBodyOr422` with a zod schema capping the message
  and a short client-held history.
- **Server-composed context.** The system prompt and the pet-context block
  (species, age, today's needs, a compact 7-day record summary) are built
  server-side; the user's free text rides only as the user message. No
  account PII (email, username) is ever sent to the provider.
- **Stateless v1.** Chat history lives in client component state (ADR-0006:
  server is the source of truth for domain data — a chat transcript is not
  domain data). No DB table; persistence is a separate backlog item.
- **Untrusted output.** The model's reply renders as plain text (no
  markdown→HTML), with a fixed disclaimer that it is not veterinary advice
  and a note that the message plus pet data go to the provider.

## Consequences

- The feature can ship, be tested and be disabled per environment without
  code changes; local dev works without any AI key.
- Prompt-injection risk is bounded: user content cannot alter the
  server-composed context, and the response has no execution surface.
- Cost is bounded by rate limits and `maxOutputTokens`; a provider outage
  degrades to an error toast, never blocks core flows.
- Swapping providers (or a local model) means changing env vars, not code,
  as long as the API stays chat-completions-shaped.
- Spec: `specs/feature-specs/ai-care-assistant.md` (spec-first before any
  implementation).
