# Playtest administration implementation plan

> Execute inline with the planning, test-driven development and verification skills. The user's supplied implementation request is the specification and authorizes focused implementation.

**Goal:** Add private invited-playtest administration and tester histories to the hosted signed-in dashboard.

**Architecture:** Extend versioned contracts and the Pages gateway. The bot remains the owner of invitations, consent, storage, redaction, collection authorization and staff endpoints. Missing endpoints/capabilities fail closed; fixtures exist only in tests.

**Stack:** Existing Astro, TypeScript, Zod, Vitest and Playwright.

**Spec:** User request and `Wilderness-Odyssey-API/docs/playtest-diagnostics-contract.md`.

## Constraints and decisions

- Work directly on the clean `website` checkout as requested. No deployment, bot edits or auth redesign.
- Use dedicated `playtests:read` and `playtests:write` capabilities restricted to administrators; backend must grant them explicitly.
- Invite redemption and installation credentials remain in the client/backend. Staff receives a private code once; no credentials in browser storage or shared packs.
- Histories are selected by tester and grouped by campaign/build. Every session/artifact response is checked against its requested ownership path.
- Desired state never proves recording. Recording requires a current collection acknowledgement and recent heartbeat. Off stops uploads immediately on the backend and authorization within 60 seconds.
- Retained-data deletion is explicit, revision checked and separate from collection off.

## Tasks

- [ ] Add failing gateway tests for authentication, strict mutation payloads, private artifact handling, response isolation and safe downloads; run them to observe missing routes.
- [ ] Implement `contracts/v1/playtests.ts`, route definitions and `server/playtest-gateway.ts`; retain existing session/origin/CSRF/idempotency machinery. Export the staff adapter contract and document the backend dependency.
- [ ] Add failing browser coverage for the new page and failure states; implement `/admin/playtests/`, focused browser API/controller/render helpers and shared staff navigation.
- [ ] Verify desired/observed states, invitation expiry, profile isolation, log text, actual Spark bytes, absent/busy Spark, stale sessions, duplicate submissions, mobile, keyboard and secret boundaries.
- [ ] Run `npm run verify`, then `npm run test:e2e` serially. Inspect desktop/mobile screenshots, console output, Pages root/legacy behavior and final diff. Obtain a fresh code review and resolve material issues.

## Review focus

- Cross-profile or stale responses must never attach data to another selection.
- Permission loss or session expiry must clear private data and block stale in-flight results.
- Ambiguous mutation failure must retain the idempotency key until refresh confirms state.
- Unredacted text, upstream URLs and unsafe content types must never become downloads.
- Backend absence must never produce success indicators or sample production records.

## Evidence ledger

- Initial checkout: clean `website`, HEAD `8106cf43`. Existing auth is bot-mediated Discord Administrator enrollment with explicit legacy Access mode.
- Bot branch and bot settings worktree inspected read-only: no invited diagnostics staff endpoints found. Client transport contract read in the API checkout. Staff adapter is an integration proposal until backend implements it.
