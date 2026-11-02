# Invited Playtester Home Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [x]`) syntax for tracking.

**Goal:** Give invited Discord users a private playtester home with real recorded statistics and history, and expose Sign in in public navigation.

**Architecture:** Add a separate participant authentication audience to the trusted bot, preserving staff authorization. Pages and the gateway Worker forward only explicit participant routes and validate account-scoped projections. SQLite owns invitation claims, membership, session ownership and statistics.

**Tech Stack:** Astro, TypeScript, Zod, Cloudflare Pages/Workers, Node.js Discord bot, SQLite, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-11-01-playtester-home-design.md`

## Global Constraints

- No passwords or website login credentials are issued.
- A tester session never grants staff capabilities.
- Website claim tokens must never be accepted as installation enrollment credentials.
- Missing durations are unavailable, never zero or inferred from login time.
- Preserve DATABASE_PATH and existing diagnostic records.
- Keep secrets out of browser bundles, repository files, test output and chat.
- Preserve Cloudflare root paths, legacy redirects and existing staff Access protection.

## Review Focus

- A forwarded DM link cannot be claimed by another Discord account.
- A revoked invitation or membership cannot survive replay or an in-flight request.
- A failed DM is visible to staff without accidentally revoking or duplicating membership.
- Recorded playtime remains correct with null durations, overlapping sessions and paginated history.
- Administrator enrollment remains independent of tester eligibility and cannot be bypassed with participant credentials.

### Task 1: Trusted participant identity and invitation lifecycle

**Files:** bot branch `src/connected/participantAuth.ts` (new), `participantInvitations.ts` (new), `http.ts`, `runtime.ts`, `dashboardAuth.ts`, `src/contracts/v1/participants.ts` (new), `test/participant-auth.test.ts` and `test/participant-invitations.test.ts` (new).

**Interfaces:** separate participant start/callback/session/logout operations beneath `/v1/admin/participant/`; separate participant cookie on Pages and participant session header upstream. Persist OAuth purpose to prevent switching a staff flow into a participant flow. Invitation records bind guildId, discordUserId, campaignId, token digest, expiresAt, claimedAt and revokedAt. `claim(actor, token)` checks owner and atomically consumes one invitation; same-account retry returns the established membership. New participants may authenticate to inspect/claim their own invitation but receive no campaign data until claiming it.

- [x] Add failing tests for wrong account, wrong guild, expired/revoked/replayed claim, concurrent claims, session expiry/logout, revocation and staff-route denial.
- [x] Run the targeted bot tests and confirm the expected failures.
- [x] Implement additive tables, bound short-lived sessions, separate OAuth purpose, atomic claims, authoritative membership and safe errors; preserve existing admin login.
- [x] Run new tests plus existing dashboard auth/permission/HTTP tests.

### Task 2: Staff invitation selection and DM delivery

**Files:** bot `src/connected/participantInvitations.ts`, `http.ts`, `runtime.ts`, `src/commands/connected/` invitation command module, command registration, `test/participant-invitations.test.ts`; website `contracts/v1/participants.ts`, `contracts/v1/playtest-routes.ts`, `src/pages/admin/playtests/index.astro`, `src/scripts/` relevant playtest controller.

**Interfaces:** invite request includes explicit Discord snowflake, campaignId, expiry and idempotency key. Staff creates an account-bound website invitation, not an installation credential. Receipt returns invitation status and DM delivery state; private fallback link is available only to authorized staff and only when needed. DM links use `/playtester/claim/#invitation=...`.

- [x] Test non-admin rejection, invalid target, duplicate requests, blocked DMs, retry without issuing a second invitation, and explicit revoke.
- [x] Run targeted tests RED, then implement invitation UI/command and Discord DM integration with bounded retry and private audit records.
- [x] Verify DM payload contains only the intended claim link and user-facing instructions, never secrets or passwords; run tests GREEN.

### Task 3: Private history and trustworthy statistics

**Files:** bot `src/connected/participantHome.ts` (new), `http.ts`, `src/contracts/v1/participants.ts`, `test/participant-home.test.ts` (new); website `contracts/v1/participants.ts`.

**Interfaces:** `GET /v1/admin/participant/home` and cursor-based `/history` derive Discord identity exclusively from participant session. Return safe account identity, memberships, current invitation summaries, instructions/announcements/tasks, per-campaign recorded playtime and total, unknown-duration count, and paginated session summaries. Do not return staff notes, logs, artifacts, credentials or other tester records. Identify tested builds only from authoritative stored metadata; missing build data stays unavailable. Compute per-campaign and total elapsed time from the union of valid known-duration intervals to avoid concurrent-installation double counting; exclude unknown durations and show coverage limitations.

- [x] Test two accounts with overlapping labels, multiple campaigns/installations, revoked membership, null durations, overlapping sessions, empty history and aggregate totals independent of pagination.
- [x] Run targeted tests RED, implement owner-filtered queries and bounded safe projections, then run tests GREEN.
- [x] Confirm projected responses cannot include staff-only fields even when source records contain them.

### Task 4: Pages and Worker participant gateway

**Files:** website `server/participant-auth.ts`, `participant-gateway.ts` (new), `server/gateway.ts`, `server/kinetic-client.ts`, `functions/_middleware.ts`, `workers/bot-gateway/routes.ts`, `transport.ts`, `contracts/v1/participants.ts`, gateway/auth tests.

**Interfaces:** public browser routes `/api/participant/auth/start`, `/callback`, `/logout`, `/session`, `/claim`, `/home`, `/history`; one exact registered participant callback or an OAuth-purpose-bound shared callback agreed with Task 1. Keep identity/session cookies separate from staff. If adding a callback, document the exact Discord Portal registration. Use existing trusted machine transport with explicit header allowlisting and route schemas; permit no arbitrary route proxying. Set private responses/pages no-store and noindex, validate subject ownership, bound bodies and timeouts, verify same-origin and CSRF on writes, fail closed on malformed responses.

- [x] Test missing machine auth, forged participant headers, unknown paths/methods, wrong user projection, arbitrary redirect, callback issuer, CSRF, logout and access revocation during slow reads.
- [x] Run targeted tests RED, implement route allowlists/auth middleware and response validation, then run tests GREEN and `npm run bot-gateway:smoke`.

### Task 5: Visible sign-in and tester home

**Files:** `src/components/Header.astro`, `src/pages/login/index.astro`, `src/pages/playtester/index.astro`, `src/pages/playtester/claim/index.astro`, `src/scripts/playtester.ts`, `src/services/participant.ts`, `src/styles/` focused styles, browser tests.

**Interfaces:** visible Sign in navigation links to login options for tester and administrator. Tester home shows own playtests, real statistics/history, announcements/tasks and support; users with both permissions can explicitly enter either area. Claim fragment is removed immediately and held only in memory. Login navigation never stores the token; user reopens DM when necessary. Existing `/playtest/` remains the game-enrollment instructions route.

- [x] Add browser coverage for desktop/mobile Sign in, keyboard navigation, invited/wrong-account/expired claims, no invitations, offline service, partial stats and pagination.
- [x] Implement pages and focused client with text-safe rendering, bounded fetches, loading/permission/offline/error states and reduced-motion support.
- [x] Inspect production desktop/mobile layouts and console; verify no tokens remain in URL, storage or rendered error messages.

### Task 6: Validation and coordinated rollout

**Files:** setup documentation, deployment verification checks where participant paths need coverage; generated API schemas through the existing export script.

- [x] Run bot checks/tests/build using bot package scripts; run website `npm run verify`, `npm run test:e2e`, gateway types/build/smoke as affected.
- [x] Preview the production build and Pages runtime; inspect sign-in, tester home, claim, admin navigation and existing game instructions. Check root paths and legacy redirects.
- [x] Review diffs for secrets, generated files, permission regressions and unrelated changes; preserve already staged issuer compatibility fix.
- [x] Document bot rollout, Worker rollout, Pages rollout, callback registration if required, and rollback without dropping SQLite tables. Respect existing protected deployment approval gates.
- [ ] After deployment, test invited tester, wrong account, admin, dual-role account, blocked DMs, revoked membership and real stats using user-performed Discord sign-in. Report only observed results.
