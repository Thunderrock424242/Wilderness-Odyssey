# Dashboard and Remembered Sign-in Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans or superpowers:subagent-driven-development to implement this plan task-by-task. Steps use checkbox syntax for tracking.

**Goal:** Ship the approved atmospheric login and dashboards with optional 30-day playtester and 7-day administrator remembered sign-in.

**Architecture:** Keep short access sessions and add a separate rotating remembered credential owned by the bot. Website Pages gateways manage secure cookies and renewal; the existing Astro pages share the approved presentation. Work from the bot and website branches separately and keep their authentication contracts synchronized.

**Tech Stack:** TypeScript, Node.js 22, existing SQLite store, Discord OAuth, Astro, Cloudflare Pages Functions, existing node:test/Vitest/Playwright suites.

**Spec:** `docs/superpowers/specs/2026-11-02-dashboard-design-and-remembered-sign-in.md`

## Global Constraints

- Remembered absolute limits: playtesters 30 days, administrators 7 days; unchecked sign-in retains 15-minute access sessions.
- Remembering is unchecked by default. No large W badge; use the approved Echo Earth/Blackout Archive mixture and sidebar layout.
- Preserve existing routes, controls, permissions, invitation claims, consent information, runtime configuration, and hosting behavior.
- No production deployment, policy change, new background polling, or credentials in browser storage/logs.
- All privileged authorization remains in the bot. Preserve CSRF, OAuth binding, bounded networking, and environment/machine authentication.

## Review Focus

- Two tabs renew simultaneously: at most one successor is created, and the stale response cannot clear the winning browser credential.
- Access expires while the browser is closed: the valid remembered credential can renew without an unexpired access cookie.
- Logout or `/dashboard disable` races with permission lookup: renewal cannot issue an authorized successor after revocation.
- Backend is unavailable during logout: browser cookies are cleared and revocation failure is reported accurately.
- An old gateway calls a new backend: omitted remember choice preserves the original response and 15-minute behavior.

---

### Task 1: Bot remembered credential lifecycle

**Files:** Create `src/connected/rememberedSessions.ts`; modify `src/contracts/v1/auth.ts`, `src/connected/dashboardAuth.ts`, `src/connected/participant.ts`, `src/connected/http.ts`; add `test/remembered-sessions.test.ts`; extend `test/dashboard-auth.test.ts`, `test/participant.test.ts`, `test/dashboard-http.test.ts`, and contract fixtures through their generator when required.

**Interfaces:** `discordStartInput` accepts optional `remember: boolean` defaulting to false, but callback input remains its existing strict shape. Callback/refresh results may include `rememberToken` and `rememberExpiresAt` together. `rememberRefreshInput` accepts `{ rememberToken }`; refresh result includes the existing callback result plus a new remembered token/deadline. Add machine-authenticated `POST /v1/admin/auth/discord/refresh` and `POST /v1/admin/participant/refresh`, using strict request schemas and existing body/rate limits. Add separate `POST /v1/admin/auth/discord/forget` and `POST /v1/admin/participant/forget` to revoke a remembered family after access expiry without minting a new access token.

- [ ] Add failing lifecycle tests: remembered admin deadline equals start-of-session clock plus `7 * 86400000`; participant deadline equals clock plus `30 * 86400000`; access deadline remains `900000` milliseconds; default login returns no remembered credential.
- [ ] Add tests for refresh after access expiry, absolute remembered expiry, wrong-role tokens, malformed input, lost enrollment, temporary permission-service failure, parallel refresh, replay rejection, logout and disable races, and reopening an existing database.
- [ ] Run `npm test`; confirm new tests fail for missing remembered behavior.
- [ ] Implement an additive remembered family store with kind, owner, guild, enrollment generation where applicable, absolute deadline, active digest, and linked short-session digests. Store only SHA-256 credential digests. Generate random 32-byte credentials; transactionally compare-and-swap the active digest when rotating. A replay never returns a successor. Concurrent renewal conflict must not revoke the winner; use the same authentication failure envelope with a distinct conflict code.
- [ ] Persist remember choice against each OAuth attempt using additive columns or a companion table, consume it atomically with the existing flow, and never accept remember choice at callback. Guard existing positional SQLite inserts when adding fields.
- [ ] Add `DashboardAuth.refresh(body: unknown)` with eligibility checks before rotation and transactional generation/revocation rechecks after awaited permission reads. Link each issued access session to its family. `ParticipantService.refresh(body: unknown)` preserves participant membership behavior. Both return the schema-defined response and retain the original absolute deadline.
- [ ] Extend logout, forget, permission-loss revocation, and dashboard disable to revoke corresponding families and linked access sessions transactionally. Forget authenticates possession of the remembered token independently of an access session and is idempotent for revoked/unknown syntactically valid tokens.
- [ ] Add HTTP route tests for machine authentication, environment enforcement, bounded bodies, remembered-token rate limiting and errors. Update auth documentation and generated contract fixtures via existing scripts.
- [ ] Run `npm run check`, `npm test`, `npm run build`; inspect diff and checkpoint the bot changes.

### Task 2: Website cookie and renewal integration

**Files:** Modify website `contracts/v1/auth.ts`, `server/discord-auth.ts`, `server/participant-gateway.ts`, `server/staff-cookies.ts`, and existing staff gateway/session helpers; create `server/remembered-auth.ts`; extend gateway tests in `tests/` and `tests/browser/discordLogin.spec.ts`, `tests/browser/participant.spec.ts`, `tests/browser/runtime.spec.ts`.

**Interfaces:** Consume Task 1's exact schemas/routes. Use separate `__Host-wo-admin-remember` and `__Host-wo-participant-remember` cookies. Add same-origin POST refresh/forget browser routes under the corresponding authentication namespace. Access cookies remain bounded to 900 seconds; remembered cookies use the backend deadline bounded by 604800 or 2592000 seconds. Never expose remembered credentials in response JSON to browser scripts.

- [ ] Add failing gateway tests asserting secure HttpOnly cookies, exact role lifetimes, strict remember input, callback binding, expired access renewal, role separation, no accidental renewal on permission failure, and no cookie clearing on concurrent refresh conflict.
- [ ] Run `npm test`; verify new tests expose the missing behavior.
- [ ] Parse only the approved remember field on sign-in start and send its boolean to the bot. Preserve ordinary no-JavaScript sign-in links/forms. Set remembered cookies only from validated callback results; clear obsolete remembered cookies when opting out.
- [ ] Implement bounded renewal through the machine-authenticated backend, with same-origin checks and browser-CSRF protection suitable for a valid remembered cookie after access expiry. Issue fresh short access cookies and rotated remembered cookies only after validated backend success. Never retry a refresh POST automatically.
- [ ] Coordinate browser renewals using a shared promise and Web Locks when available; handle the server conflict code by rechecking current session once without clearing cookies. On older browsers, server compare-and-swap still prevents duplicate successors.
- [ ] Renew on page entry and before a user operation when required, not on an interval. Fetch a fresh CSRF token after renewal. Retry only reads automatically; do not replay an administrative mutation unless the existing request has its documented idempotency protection and is known not to have executed.
- [ ] Logout independently revokes the remembered family using forget even when access expired, and clears both role-specific browser cookies after a verified same-origin request. Report upstream revocation failures accurately.
- [ ] Regenerate contract schemas with `npm run contracts:export`, run `npm test` and `npm run check`, and inspect changed generated schemas.

### Task 3: Approved login and shared dashboard presentation

**Files:** Modify website `src/pages/login/index.astro`, `src/scripts/login.ts`, `src/styles/operations.css`, `src/styles/authoring.css`, `src/styles/playtester.css`, `src/layouts/StaffLayout.astro`, `src/layouts/AuthoringLayout.astro`, `src/layouts/PlaytesterLayout.astro`, `src/pages/playtester/index.astro`; create `src/components/StaffNavigation.astro` and `src/styles/workspace.css`; extend existing browser tests.

**Interfaces:** Reuse all existing DOM hooks and service APIs. Shared navigation takes the current route and renders links grouped by operations, community, and website. Login role selector chooses existing participant/admin start routes and includes the unchecked remember choice. No mock statistics or new overview API.

- [ ] Add browser assertions for two login roles, unchecked remember choice, correct target route for each role, role-specific accessible setup help, sign-in without JavaScript, and visible expired/unavailable messages.
- [ ] Run focused browser tests and confirm the new requirements fail before implementation.
- [ ] Build the approved split login with a decorative misty blue landscape and violet accent, wordmark text without the W, soft headings and restrained industrial detail. Keep landscape decoration out of the accessibility tree. Use shared tokens and scoped styles; maintain native controls and visible focus.
- [ ] Render consistent grouped sidebar navigation across operational and authoring layouts. Preserve all existing destinations and capability-aware visibility, and mark current links with `aria-current`. Narrow screens reflow navigation without clipping or removing destinations.
- [ ] Reorder playtester content to invitations and active campaigns first, then recorded statistics/history, while retaining consent, invitation-claim and time-accounting information. Reuse existing dynamic rendering hooks.
- [ ] Connect login choice/checkbox and existing scripts to Task 2's renewal helpers, retaining intentional redirects and the current error-message allowlist.
- [ ] Verify keyboard role selection/help, no-JavaScript login, 320px and desktop layouts, authoring forms, existing staff actions and participant invitation/history interactions.

### Task 4: Integration validation and delivery

**Files:** Update branch-specific auth/setup docs and this plan's checkboxes; keep implementation confined to the files above unless directly required.

- [ ] Website: run `npm run verify` and `npm run test:e2e`. Inspect login, administrator operations, authoring, playtester home and claim route in production preview and Pages runtime; check browser console, mobile layouts and existing redirects.
- [ ] Bot: rerun `npm run check`, `npm test`, `npm run build` after final contract changes.
- [ ] Review diff and use an independent final reviewer for authorization bypasses, token leakage, renewal/logout races, functionality loss and visual consistency. Resolve findings and rerun affected checks.
- [ ] Record coordinated rollout order: backend support first, website second; identify local validation and any live Discord checks still required. Do not deploy or register commands.
- [ ] Deliver the validated changes, screenshots and remaining material limitations. Do not claim a check passed without its command output.
