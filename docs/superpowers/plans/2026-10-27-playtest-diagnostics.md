# Invited diagnostics implementation plan

**Goal:** Implement the approved client contract and protected staff controls on bot only.
**Spec:** `docs/playtest-diagnostics-contract.md` (verbatim API checkout copy).
**Architecture:** Existing connected HTTP authentication, current dashboard authorization and SQLite transactions. Separate immutable metadata and private SQLite BLOB files provide one durable commit; fixed download names, no filesystem paths or remote fetches. Pages retains browser CSRF/origin enforcement.
**Constraints:** No deployment/live registration/website edits; optional Minecraft ownership only; collection leases <=60 seconds; revoke/off wins after body reads; no credentials in lists/logs; retain old reports until explicit deletion.

- [x] Add real HTTP/storage behavior tests; establish missing-route failure.
- [x] Add strict client schemas and transactional invitation, enrollment, policy, session/artifact storage. Bound request/decoded/global bytes, hash credentials, deduplicate immutable IDs, retain deletion tombstones.
- [x] Add staff campaign/tester/invite/list/download/delete routes through existing authentication, permissions, revisions and durable idempotency. Document exact schemas and recovery.
- [x] Remove ownership gate only from playtest acceptance/session creation; update invitation/automatic association/manual fallback copy while retaining report flows and receipts.
- [x] Run check/test/build, inspect diff and security boundaries, report local evidence separately from live acceptance.

Validation: `npm run check`, `npm test` (114 passed, zero failed), and `npm run build` passed. HTTP tests/build/check required approved runs outside the process sandbox after local loopback or silent process failures. Shared contract SHA-256 matches the API checkout. Independent review findings about stale recording freshness, client-clock ordering and terminal Spark updates were reproduced and fixed with regression tests. No deployment, live registration, website edit or installed-client acceptance was performed.

Review focus: concurrent redemption; off/revoke during body upload; session ID collision across installations; deletion followed by replay; stale collection after restart. Tests exercise these through real requests and durable SQLite.
