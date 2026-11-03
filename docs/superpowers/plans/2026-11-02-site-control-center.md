# Website control center implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan task by task. The user approved the linked scope; implement inline in this chat.

**Goal:** Allow invitations to outside Discord accounts and connect the hosted editor to real, protected bot services.

**Architecture:** Extend the existing Kinetic HTTP/authentication pipeline and SQLite store. Reuse the website branch's strict content contracts. Keep draft persistence, private media and reviewed repository publication separate. Preserve existing operational controls and document the remaining control-center inventory.

**Tech Stack:** TypeScript, Node.js 22, discord.js, node:sqlite, Zod, GitHub REST API.

**Spec:** `docs/superpowers/specs/2026-11-02-site-control-center.md` (approved by the user in chat).

## Global constraints

- Preserve startup behavior, existing authentication and environment settings.
- Recheck current staff authority after asynchronous work and before mutations.
- No secrets, private drafts or media in public responses or audit payloads.
- Bounded external requests and bodies, strict schemas, idempotency, revisions and audits.
- Website UI remains on the website branch; preserve unrelated local files.

## Review focus

- An outsider must be able to claim only their own invitation even if Discord refuses delivery.
- A valid login must grant only capabilities supported by real backend services.
- Stale saves and retries must not overwrite a newer draft or published source.
- Unsafe Markdown, forged images, missing references and oversized requests must be rejected before persistence.
- A draft save or a pull request must never be reported as completed public deployment.

### Task 1: Outside-server invitations

**Files:** `src/connected/runtime.ts`, `src/commands/connected/playtester.ts`, `test/participant-command.test.ts`, `test/participant-invitation.test.ts`.

- [ ] Reproduce outsider rejection with the actual runtime and in-memory database; cover blocked DMs, account binding, invalid IDs, bot identities and permission revocation after lookup.
- [ ] Use Discord user lookup instead of guild-member lookup. Keep bounded calls and private fallback links. Support an explicit account ID in slash commands while preserving the existing account option.
- [ ] Run tests and compiler checks; inspect registration payloads without registering live commands.

### Task 2: Hosted editor contracts, private drafts and source import

**Files:** `src/contracts/v1/content.ts`, `src/contracts/v1/authoring-routes.ts`, `src/contracts/v1/admin.ts`, `src/connected/content.ts`, `src/connected/http.ts`, `src/connected/admin.ts`, `src/connected/operator.ts`, tests.

- [ ] Add failing tests for the real HTTP content flow and session permissions, using the website contracts as the expected response shapes.
- [ ] Copy content contracts from the website source; add only supported content capabilities to backend sessions.
- [ ] Implement durable transmission and structured-page records, strict validation, revision checks, narrow audits and transactional idempotency. Draft creation/update returns only `draft-saved`.
- [ ] Add explicit trusted-host source import using the existing website snapshot format, preserving records and source revisions without runtime dependency on the website checkout.
- [ ] Test restart persistence, malformed/unsafe content, references, missing records, conflict/retry behavior, revoked sessions and anonymous reads.

### Task 3: Private images

**Files:** `src/connected/contentMedia.ts`, `src/connected/http.ts`, content service tests.

- [ ] Test image signatures, bounded upload/download, path/metadata validation, response projection and authorization loss after body reads.
- [ ] Implement private SQLite BLOB storage with generated paths/IDs, validated PNG/JPEG/GIF/WebP bytes, a storage quota and no public file URLs.
- [ ] Wire fixed image routes to the existing authenticated pipeline with private headers; include media previews in content responses.

### Task 4: Reviewed publication

**Files:** `src/connected/contentPublishing.ts`, connected configuration/runtime, operator setup documentation, publication tests.

- [ ] Test the GitHub transport against synthetic responses: expired/revoked staff authority, source conflicts, missing configuration, PR creation, retries and deployment status.
- [ ] Implement host-configured GitHub App authentication and narrow repository writes to the website branch, content paths and referenced images. Persist frozen publication jobs and private audit metadata.
- [ ] Track review/deployment truthfully; preserve branch protection and workflow ownership. Return unavailable when host prerequisites are absent, never success placeholders.

### Task 5: Control-center inventory and final verification

**Files:** docs and directly relevant route/contract tests.

- [ ] Map the site's existing maintenance, service/model, moderation, report and playtest controls to supported backend routes. Identify remaining staff-only Discord actions explicitly for the next control-center increment.
- [ ] Document host source import, GitHub App setup, rollout order, capabilities and missing deployment evidence.
- [ ] Run `npm run check`, `npm test`, `npm run build`; review all diffs and source-only startup dependencies.
