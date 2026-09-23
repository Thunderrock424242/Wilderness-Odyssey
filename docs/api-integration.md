# Wilderness Odyssey API contract 1.0

The website is a client and identity-verifying gateway. Kinetic remains the authority for permissions, moderation records, incidents, durable operations, and audit history. The main Minecraft 1.21.1 NeoForge/Ollama server remains the authority for telemetry, verified players, inference admission, installed-model readiness, and local operations. These backend implementations are not included in this website repository.

## Shared definitions

`contracts/v1/status.ts`, `admin.ts`, and `routes.ts` define runtime validation. `npm run contracts:export` generates language-neutral `contracts/v1/schemas.json` from those definitions. It contains each method, website path, backend path, capability, input/query schema, and response schema. Both backend projects must run these contracts against their producers; schema agreement alone is not runtime proof.

All response envelopes use `schemaVersion: "1.0"`. Breaking changes require a new URL major version. Additive response fields can be ignored; the gateway projects known fields before returning them. Request objects reject unknown fields. Times are ISO 8601 UTC/offset timestamps; duration/latency units appear in field names. Missing metrics are null, not zero.

The website calls only same-origin `/api/public/v1/status` and `/api/admin/v1/*`. Public upstream URL is separately configured. Administration paths map explicitly to `KINETIC_ADMIN_ORIGIN/v1/admin/*`; arbitrary paths, hostnames, commands, and caller-provided upstream credentials are rejected.

## Two independent identities at Kinetic

The Pages Function validates the website Access JWT's signature, issuer, audience, expiry, issued-at, subject, and human identity. It sends:
- Machine authentication through `CF-Access-Client-Id` and `CF-Access-Client-Secret` to Kinetic's own Access application.
- The original website JWT in `X-WO-User-Assertion`.
- `X-WO-Environment` and a correlation ID.

Kinetic must independently validate the machine application's signed assertion against its own audience, and the forwarded staff assertion against the deliberately trusted website audience for that environment. These are distinct application tokens. Never treat the website token as a login credential for Kinetic's Access application. Never trust unsigned identity/role headers or permit a service identity to become a human moderator.

Resolve issuer plus subject to a current backend staff assignment. `GET /v1/admin/session` returns the Access subject as `user.id`, a safe display name, role, and capabilities. The Function rejects a mismatched subject. Kinetic must reauthorize every subsequent read and write, including individual records/cases and operation status. Session lookup and UI capabilities do not replace that check.

Role ceilings: Viewer can read status and approved models. Moderator adds verified player and report moderation. Administrator adds service, maintenance, inference, and approved model/settings writes. Backend policy can be stricter. Role assignment is performed by an existing authorized backend process, not this website.

## Public status

The bot aggregates main-server observations and emits only the public schema. Include observation time and freshness period; Minecraft state, online/max players, TPS/MSPT, Minecraft/modpack versions and loader; Ollama/inference readiness, request pause state, and optional p50/p95 response latency with its own observation time/window/sample count; maintenance and sanitized public incidents.

Do not include player names, UUID lists, addresses, stack traces, model prompts, conversation text, tokens, or internal incident notes. A failed collector does not establish that a game server is offline. Use unknown when evidence is unavailable. Website/API calls must not start inference health probes per visitor; use independently scheduled bounded probes or observed inference results.

The website uses a 30-second refresh with failure backoff to 120 seconds, stops network polling in hidden tabs, and ages measurements using their original observation timestamps. It permits a backend freshness window of 15–300 seconds. Cached data never receives a new measurement timestamp.

## Backend endpoints

The generated schema is the exact field reference.

| Method | Kinetic path | Purpose |
| --- | --- | --- |
| GET | /v1/admin/session | Current staff identity/capabilities |
| GET | /v1/admin/overview | Status, bounded performance history, revisions, approved service actions, recent operations |
| GET | /v1/admin/incidents | Authorized incident information |
| PUT | /v1/admin/maintenance | Update maintenance with reason/revision |
| PUT | /v1/admin/ai-requests | Pause/resume new inference admission |
| POST | /v1/admin/service-operations | Request an approved named operation |
| GET | /v1/admin/operations/:id | Authorized operation progress |
| GET | /v1/admin/players?q=... | Verified player search, optional cursor |
| GET | /v1/admin/players/:uuid | Recent history, restrictions, appeals |
| POST | /v1/admin/players/:uuid/warnings | Issue a reasoned warning |
| POST | /v1/admin/players/:uuid/restrictions | Apply an expiring Aether restriction |
| POST | /v1/admin/players/:uuid/restrictions/:id/revoke | Revoke with revision/reason |
| POST | /v1/admin/players/:uuid/appeals/:id/resolve | Accept/reject/escalate appeal |
| GET | /v1/admin/reports | Submitted report summaries, optional cursor |
| GET | /v1/admin/reports/:id | Authorized report excerpts and action history |
| POST | /v1/admin/reports/:id/resolve | Resolve/escalate with revision/reason |
| GET | /v1/admin/models | Approved installed models, readiness, settings and permitted bounds |
| POST | /v1/admin/model-changes | Request an approved model by opaque ID |
| PUT | /v1/admin/inference-settings | Request only temperature, numPredict, numCtx changes |

## Mutations and durable operations

The browser sends same-origin JSON with a signed session-bound CSRF token and an idempotency key. The Function verifies CSRF/origin and forwards the idempotency key with validated input. Reasons require 10–1000 characters.

Kinetic must atomically persist idempotency outcomes per actor/action/key, reject reuse with a different payload, compare revisions, authorize each operation, and audit accepted and denied attempts. Retain keys for the documented retry window. Do not execute before durable authorization/idempotency records exist.

All writes return an operation envelope with requested/approved/running/succeeded/failed/cancelled state. Immediate moderation writes can return succeeded after the backend transaction commits. Requested/approved states do not mean the service action ran. GET operation status must enforce the requesting actor's permissions and resource scope.

Maintenance and AI admission are independent controls. Model changes must handle draining/admission, readiness confirmation, and recovery on failure in the backend. The website cannot promise a rollback or service restart succeeded.

## Verified players, reports, and privacy

Resolve players from the main server's authoritative UUID-based records or a verified account-linking process. Do not accept a typed username or Discord claim as proof of identity. Validate UUID/record ownership again for every moderation action.

Only player-submitted reports make excerpts available. Validate provenance; limit excerpts; redact unrelated personal data; require case-scoped permission; audit excerpt reads and decisions. The report detail contract includes provenance and retentionUntil. Decide the retention period before enabling the endpoint, enforce deletion server-side, and distinguish minimal action audit metadata from retained conversation text. This website adds no universal conversation logging or database.

The gateway never caches administrative responses. The browser keeps current records in memory only, clears them on session failure/navigation, and stores no staff records or credentials in localStorage. The old content-editor mock remains development-only and is unrelated to live operations.

## Model and service allowlists

Return only approved installed models, with opaque safe IDs, current readiness, and allowed setting ranges. Kinetic must reject arbitrary model names, pull/download requests, raw Ollama payloads, system-prompt editing, shells, RCON strings, and arbitrary command arguments. Service operations use backend-defined operation IDs. Recheck availability and authorization at execution time, not only when the dropdown was populated.

## Errors and operational limits

Use 401 for invalid identity, 403 for denied policy, 404 for unknown/hidden records, 409 for stale revisions/idempotency conflicts, 422 for rejected policy input, 429 for rate limiting, and 503 for unavailable dependencies. Avoid raw exception strings. The gateway does not forward upstream cookies, redirects, CORS headers, or raw error bodies.

The gateway caps mutation JSON at 16 KiB, public responses at 64 KiB, administration responses at 1 MiB, and upstream requests at eight seconds. Collections are bounded in the schema. Player/report list endpoints support cursor pagination; detail histories are explicitly recent bounded windows. Apply per-actor and per-machine rate limits in Kinetic and appropriate edge controls before exposure.

## Cross-project acceptance

Verify schema compatibility, valid and invalid machine/staff tokens, preview rejection at production, role/resource denials, stale/partial telemetry, idempotent retries after lost responses, conflicting revisions, audit records, expiry/revocation, model readiness, and report retention against a staging environment. Contract fixtures are test data and must never be displayed as real service data.