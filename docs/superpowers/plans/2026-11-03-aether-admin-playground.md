# Aether admin playground implementation plan

> **For agentic workers:** Use executing-plans and test-driven-development. Independent client/UI work may use dispatching-parallel-agents; review the complete change before deployment.

**Goal:** Deliver the approved website/bot Aether connection, sandbox, reviewed examples, training job controls, and an exact Aether-server Codex handoff.

**Architecture:** A shared Zod contract spans browser, Pages, gateway and bot. A focused peer client owns authenticated remote calls; the bot owns private reviewed examples and request history. The Aether server owns inference, training workers, hardware policy, model artifacts and activation.

**Tech stack:** Existing TypeScript/Zod, Node 22 SQLite, Astro, Cloudflare Workers/Pages. No new runtime dependencies.

**Spec:** `docs/superpowers/specs/2026-11-03-aether-admin-playground.md` (approved in chat).

## Constraints

- Preserve existing main-server endpoints and hosting startup.
- Keep private examples out of logs/public assets/browser storage.
- No model runtime, trainer, shell or activation implementation in the Discord bot.
- Fail closed on missing peer support, wrong identity and changed destination.
- Keep privileged actions server-authorized, CSRF protected, bounded and idempotent.

## Task 1 — Shared contract

- [x] Add `src/contracts/v1/aether-playground.ts`, mirror it into website contracts, and define strict route/capability/body bounds.
- [x] Define exact peer capability, sandbox and durable training request/status/cancel contracts. Preserve the current Java admission schema.
- [x] Add fixtures and contract export coverage. Watch invalid fixtures fail before fixes.

## Task 2 — Aether and main-server transport

- [x] New `src/connected/aetherGatewayClient.ts` and configuration validation; preserve `MainServerClient` while adding optional paired Access service credentials.
- [x] Validate native health/readiness/admission responses; pin new peer capabilities to the expected server ID. Never infer readiness from credential presence.
- [x] Use fixed endpoints, response limits, bounded waits, sanitized failures and no redirects.
- [x] Test missing configuration, wrong server, unsupported routes, timeout, token/header separation, exact admission payload and peer job identity/hash checks.

## Task 3 — Private examples and training orchestration

- [x] New focused store/service modules and tests, wired through runtime and authenticated HTTP.
- [x] CRUD/review examples with revisions, approved-only immutable dataset hashes, quotas/retention and deletion-safe idempotency.
- [x] Submit durable peer requests using a stable request ID; record uncertain acknowledgement honestly and reconcile by request ID without replaying training.
- [x] Pin history to the original destination/server. Recheck permission after remote waits and keep prompt bodies out of audit records.

## Task 4 — Website/gateway

- [x] Add typed API client, `/admin/aether-playground/`, navigation, readiness/setup guidance, sandbox controls, examples/review and training jobs/cancellation/reconciliation.
- [x] Wire Pages and Worker allowlists with exact contracts and bounded sandbox deadlines. Do not advertise a running trainer when the peer is absent.
- [x] Test missing setup, identity loss, schema/scope checks, approved-only submission, keyboard/mobile use, source-safe text rendering and private response caching.

## Task 5 — Server handoff and owner guide

- [x] Write `docs/aether-server-codex-handoff.md` with copyable instructions, exact contracts, native Java schema findings, missing `/v1/service/*` adapter, secret separation and live acceptance criteria.
- [x] Update owner documentation with setup steps, differences between testing/training/activation, privacy and remaining server obligations.

## Task 6 — Review and rollout

- [x] Run bot check/build/full Node 22 tests; website verify/full browsers; compiled gateway smoke. Review the complete diff.
- [ ] Push bot/website branches, deploy gateway, monitor normal Pages CI and verify its exact commit.
- [ ] Report Kinetic update/configuration and server-side implementation as remaining dependencies, and deliver the requested Codex message.
