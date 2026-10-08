# Hosted Admin Implementation Plan

> Execute inline with `superpowers:executing-plans`, test-driven development, and verification. The user approved the design with “lets do it”; repository instructions say to implement clear requirements without repeated confirmation. Keep changes uncommitted, preserve the active Discord-login work, and do not deploy or publish repository content.

**Goal:** Let a currently authorized website administrator edit private content, request reviewed publication, configure approved service connections, replace connection credentials, and use the existing operation controls.

**Architecture:** The website supplies schema-validated forms and a same-origin gateway using the existing staff session. A separate bot checkout owns durable content/configuration services, encrypted credentials, Discord permission verification, and GitHub publication jobs. The existing website deployment workflow remains authoritative.

**Tech Stack:** Astro, Pages Functions, Zod, existing editor, Vitest/Playwright; bot Node SQLite, crypto, Discord REST, bounded GitHub APIs.

**Spec:** `docs/superpowers/specs/2026-10-07-hosted-admin-content-and-settings-design.md`.

## Global constraints

- JSON operations/configuration: 16 KiB. Content saves: 2 MiB. Images: 12 MiB with at most 1 MiB multipart overhead.
- Keep privileged work on the backend; use explicit routes, capabilities, revisions, idempotency, same-origin CSRF, and current authorization after asynchronous work.
- Keep production/preview separate. Authenticated drafts/media/configuration use no-store responses; credentials never appear in responses or generic stored JSON.
- Preserve lore/assets/URLs, unrelated dirty changes, the local editor, main-server policy, and deployment approval gates.
- Implement website changes in an isolated worktree, incorporate current login code as a dependency snapshot, and integrate only this feature's changes back into the website checkout.
- Implement backend changes in a separate `bot` worktree. Do not check out bot files in the website checkout or start a real bot.

## Review focus

- Concurrent edits and configuration replacement cannot silently overwrite newer data or redirect an accepted operation to another server.
- Expired or revoked administrators cannot upload, read private media, publish, or replace credentials after an awaited request.
- A misleading backend success response cannot reveal secrets or imply publication, write verification, or application that has not happened.
- A public repository makes publication-request source public; private drafts must never be imported into source or builds prematurely.
- Reinstall/restart/encryption-key failures preserve records and fail closed instead of creating empty permissive configuration.

## Task 1: Shared contracts and website gateway

Files: create `contracts/v1/content.ts`, `contracts/v1/configuration.ts`, `contracts/v1/authoring-routes.ts`, `server/authoring-gateway.ts`, `tests/authoringGateway.test.ts`; extend `contracts/v1/admin.ts`, `scripts/export-contracts.ts`, and the existing gateway through one narrow dispatch hook.

Interfaces: `authoringRoutes` describes fixed JSON routes with capability/schema/body limit. `handleAuthoring(request, env, dependencies)` resolves the existing staff session, validates requests, and projects upstream responses. Media has a separate bounded upload/read path.

- [ ] Write tests for unauthorized reads, administrator capabilities, schema projection, revisioned content saves, credential submission/redaction, CSRF/idempotency, body limits, and arbitrary route denial.
- [ ] Run `npm test -- tests/authoringGateway.test.ts`; confirm failures show the missing authoring capability/routes.
- [ ] Implement strict content/configuration schemas and bounded gateway handlers using `staffSession` and the existing machine credentials. Add capabilities only to the administrator ceiling.
- [ ] Run focused tests, then website compiler checks. Export the real new contracts alongside the login contracts.

## Task 2: Hosted content and service-settings UI

Files: create `src/lib/admin/hostedApi.ts`, `src/pages/admin/settings/index.astro`, `src/pages/admin/content/pages.astro`, `src/scripts/adminSettings.ts`, `src/scripts/adminPages.ts`; adapt `src/pages/admin/content/index.astro`, `src/scripts/admin.ts`, `src/lib/admin/types.ts`, and shared staff navigation.

Interfaces: `HostedAdminCmsService` adapts the existing editor to v1 staff session/content endpoints. Settings uses configuration projections and write-only credential requests. Structured content uses the shared site/roadmap/gallery schemas.

- [ ] Test the real hosted adapter with controlled HTTP responses: expired session, safe record validation, conflict, private save versus explicit publication, bounded media, and safe errors.
- [ ] Run adapter tests and confirm the feature is missing before implementation.
- [ ] Wire production content editing to the shared session while retaining local/mock behavior. Add semantic settings/structured-content forms, visible focus, responsive layouts, pending states, and explicit credential-input clearing.
- [ ] Check the website and run focused tests. Browser fixtures exercise content/settings forms, denied/expired access, keyboard navigation, mobile layout, and console output.

## Task 3: Backend shared session and enrollment dependency

Files in bot checkout: vendor shared contracts; add focused dashboard enrollment/session/OAuth modules and `/dashboard enable|disable`; extend `src/connected/auth.ts`, `http.ts`, `runtime.ts`, config validation, and command registration without replacing existing owners.

Interfaces: machine authentication is independent of human authentication. Dashboard authorization resolves the opaque session, active enrollment, current guild membership/Administrator permission, and authentication time. OAuth start/callback/logout match `contracts/v1/auth.ts` from the website login work.

- [ ] Add backend tests for bot-created enrollment, owner/Administrator eligibility, wrong-guild/DM denial, state/nonce replay and expiry, revocation, current Discord checks, and write freshness.
- [ ] Run the relevant Node tests and confirm missing behavior.
- [ ] Implement bounded fixed Discord OAuth/REST requests, hashed state/nonce/session storage, 5-minute attempts and 15-minute sessions, and safe auth endpoints. Integrate commands through existing registration.
- [ ] Run bot checks and tests; preserve Access mode explicitly and deny failed Discord mode without fallback.

## Task 4: Private content/media storage and source codecs

Files in bot checkout: `src/connected/contentStore.ts`, `contentCodec.ts`, `contentService.ts`, `contentMedia.ts`, and focused tests. Website: move editable site/roadmap/gallery values into validated data files while preserving current module interfaces.

Interfaces: content documents have kind/id/data, draft revision, source revision, and publication metadata. Backend private media is hash-addressed, bounded, verified, and delivered only after current authorization. Content codecs read/write only approved source record formats.

- [ ] Test durable drafts, stale revision denial, source import without loss, hostile Markdown/links/paths/images, anonymous media denial, and restart recovery with temporary SQLite/media storage.
- [ ] Watch the tests fail, then implement transactional storage and codecs. Keep uploads/drafts outside public assets and preserve source values during migration.
- [ ] Verify tests and import/build the unchanged website data. Ensure private draft content cannot enter the site build.

## Task 5: Runtime connection configuration and encrypted credentials

Files in bot checkout: `src/connected/configurationStore.ts`, `configurationService.ts`, `credentialVault.ts`; adapt `config.ts`, `runtime.ts`, `monitor.ts`, `mainClient.ts` through their existing owners; add tests and operator setup.

Interfaces: configuration reads return safe settings/credential metadata; writes require revisions/idempotency. Vault uses AES-256-GCM with a host key, unique nonce, and environment/service/scope binding. Connection validation returns read/write/application states rather than raw upstream data.

- [ ] Test secret confidentiality in database/API/audit/idempotency, wrong-key failure, scope/environment binding, concurrent revision conflict, restart persistence, current authorization, and destination/server allowlists.
- [ ] Run tests before implementing the store/vault/service.
- [ ] Implement one managed-config precedence, trusted-host bootstrap/import, fixed read/write credential scopes, and bounded read-only verification. Clear old caches/timers and fence old revisions when applying changes.
- [ ] Test that queued operations retain their original service identity; unverified write credentials cannot dispatch. Verify backend compiler/tests/build.

## Task 6: Repository publication and exact deployment tracking

Files in bot checkout: `src/connected/contentPublisher.ts`, `githubContentClient.ts`, publication tests; extend backend scheduling and audit records.

Interfaces: a publication request freezes validated draft/media revisions; a durable job prepares only approved repository paths on a dedicated branch/PR. Status tracks review, final merge commit, workflow/deployment, and verified deployed revision.

- [ ] Test path restrictions, public-source notice, permission revocation before side effects, conflicted source revisions, retry/reconciliation by job identity, incomplete approval, and mismatched deployed commits with synthetic GitHub responses.
- [ ] Run failing tests, implement short-lived narrowly scoped GitHub App tokens and bounded fixed APIs, then run them again.
- [ ] Preserve existing workflow/branch protections. Keep draft saves independent of publication and never report checks alone as deployed.

## Task 7: Backend HTTP integration and operator guide

Files in bot checkout: focused authoring HTTP router, existing runtime/http wiring, `.env.example`, operator commands, setup guide; website integration/deployment/CMS docs.

- [ ] Exercise actual HTTP handlers with synthetic machine/human authorization: all new content/settings routes, media bounds, wrong environment, failed dependencies, and credential replacement requiring a fresh session.
- [ ] Implement narrow handler integration and explicit configuration/readiness errors. No unrestricted URL/file/shell operations.
- [ ] Write one operator guide with exact host variables, initialization/backup commands, expected unavailable/ready states, peer credential requirements, and staging verification order. Keep secrets out of examples and test artifacts.
- [ ] Run full bot checks/tests/build and website `npm run verify`.

## Task 8: Integration, browser verification, and review

- [ ] Refresh the isolated website dependency snapshot from completed login work; apply only this feature's changes back to the original website checkout, resolving integration seams without discarding unrelated edits.
- [ ] Run complete website and backend validation once integrated. Production browser tests inspect affected pages, navigation, keyboard behavior, narrow/desktop layouts, and unexpected console errors.
- [ ] Request one fresh review of the complete feature; fix important findings with a failing regression test followed by passing focused/full checks.
- [ ] Leave source changes uncommitted and supply exact website/backend paths, commands, remaining one-time setup, and any unrun live acceptance tests. Do not claim live Discord/GitHub/Cloudflare/main-server validation from fixtures.

## Execution ledger

Track completed tasks, dependency snapshot, touched-file ownership, verification evidence, and rulings in a task-specific ignored ledger. Routine implementation proceeds without further confirmation; external setup/publication/deployment stays outside this local implementation authorization.
