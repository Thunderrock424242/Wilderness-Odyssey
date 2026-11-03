# Playtester inbox implementation plan

**Goal:** Complete two-way playtest messaging and update broadcasts with owner-selected Discord admins.
**Spec:** `docs/superpowers/specs/2026-11-02-playtester-chat.md`.
**Execution:** Inline using the executing-plans and test-driven-development skills already loaded in this chat. Preserve all earlier bot changes. No live deployment or messaging.

- [x] Add shared strict inbox contracts, SQLite messages/files/approvals/outbox, eligibility/routing, quotas and opt-outs. Test ownership, deduplication, routing, revocation, pagination and storage failure.
- [x] Add bounded Discord DM intake and diagnostic attachments; wire DirectMessages/Channel partials and early message handler. Test actual handler behavior with controlled Discord/fetch boundaries.
- [x] Add authenticated staff routes, owner-only approvals and queued replies/broadcasts with fresh authorization and truthful delivery states. Test permission loss, outsider eligibility, lost delivery acknowledgement and idempotency.
- [x] Add website contracts/gateway/Worker allowlist and a private inbox UI, owner approval controls and campaign update composer. Reuse CSRF/session/layout patterns and text-only rendering. Test gateway and browser workflows.
- [x] Review all changes independently, fix findings with regressions, run bot check/tests/build and website verify/browser checks, and document rollout and limitations.

Verification: bot compiler and production build pass; Node.js 22 full suite 178/178. Website verify passes (250 tests, compiler/build/link checks); full browser suite 92/92. Review fixes reproduced RED then GREEN: owner approval idempotency, opt-out during upload, storage admission/buffer budget, broadcast delivery window, and private attachment MIME/approval checks. Source changes remain local and uncommitted in both checkouts; no live messages, deployment or registration.
