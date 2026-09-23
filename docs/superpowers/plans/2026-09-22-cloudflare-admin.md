# Cloudflare website implementation plan

> Execute inline using superpowers:executing-plans. User approved implementation; do not add another approval gate for local changes.

**Goal:** Deliver the public website, protected staff dashboard, versioned contracts, and gated deployment pipeline.

**Architecture:** Static Astro plus Pages Functions. The gateway validates Access and messages; Kinetic owns roles, records, and operations. Runtime connections default to unavailable.

**Tech Stack:** Astro, TypeScript, Zod, jose, Wrangler, Vitest, Playwright.

**Spec:** ../specs/2026-09-22-cloudflare-admin.md

## Global constraints

- No deploy, DNS, production-service operations, push, or merge.
- Preserve roadmap data, content, styling, local editor, legacy links, and unrelated work.
- No upstream secrets or private addresses in browser bundles; no unauthenticated staff data.
- Verified UUIDs for player actions; report-scoped conversation access; approved models/settings only.

## Review focus

- An expired measurement must never remain green after refresh failure.
- Preview or service identities must not become production staff identities.
- Unknown fields, routes, redirects, and oversized payloads must not turn the gateway into a proxy.
- A checks-only Actions run must not report that a post is published.
- Authentication failures must not fall through to static staff pages.

## Task 1: Contracts and security gateway

Files: contracts/v1/*; server/*; functions/*; tests/gateway.test.ts; tests/status.test.ts.
Interfaces: publicStatusSchema, admin route definitions, handleGateway(request, env), statusPresentation(payload, now).

- [x] Write behavioral tests for signature/audience/expiry, unauthorized mutations, sanitization, stale status, route allowlists, CSRF, and bounded upstream requests; run them red.
- [x] Implement schema-derived public/admin contracts, environment checks, Access JWT verification, backend session/capability checks, signed CSRF tokens, strict upstream routing and response projection.
- [x] Run focused tests and export JSON Schema from the same source definitions.

## Task 2: Public pages and four dashboard sections

Files: src/pages/status/*; src/pages/support/*; src/pages/admin/*; src/layouts/StaffLayout.astro; src/components/status/*; src/scripts/status.ts; src/scripts/staff.ts; src/styles/operations.css; tests/browser/*.
Interfaces: same-origin /api/public/v1/status and /api/admin/v1/*; no direct backend connection.

- [x] Add browser scenarios for unavailable data, stale data, keyboard access, and read-only staff behavior.
- [x] Add status summary/dashboard/maintenance notice and practical support pages; keep existing content and roadmap.
- [x] Move the working local editor to /admin/content/ and implement four operational pages with request/result handling, capabilities, reasons, and confirmation.
- [x] Exercise the pages against controlled fixtures, labelled test data, and unavailable endpoints.

## Task 3: Migration and deployment

Files: astro.config.mjs; wrangler.jsonc; scripts/build-pages.mjs; scripts/verify-deployment.mjs; scripts/local-admin*; .github/workflows/deploy-site.yml; public/_headers; public/_redirects; tests/publishing.test.ts.
Interfaces: one deployment artifact including compiled Functions, revision.json, and explicit production/preview environment bindings.

- [x] Test publication states and deployment verification against controlled responses.
- [x] Parameterize root/base URLs; preserve old routes; update the publisher to use actual GitHub deployment status.
- [x] Build Functions locally; keep CI deployment disabled by default and require protected environments.
- [x] Verify artifact routes, private-data exclusion, legacy links, and unauthenticated staff denial.

## Task 4: Integration documentation and final verification

- [x] Document exact backend endpoints, identity trust, role policy, retention, environment setup, deploy approval, and rollback.
- [x] Run complete check/test/build/browser verification and production dependency audit; report actual evidence.
- [x] Request a fresh security/correctness review while independently finishing documentation; address material findings.

## Execution record

Ruling: implement in the clean existing website checkout, preserving the user's visible workspace. No commit or publication is needed for reviewable local delivery.
Ruling: use this approved plan for direct execution; user explicitly approved code and local validation in the prior turn.

## Local completion evidence

- npm run verify passed: Astro checked 81 files with zero errors/warnings; gateway TypeScript checks and content validation passed; 64 tests passed in 10 files; Astro built 50 pages; artifact checks validated 57 HTML files and the compiled Pages worker directory.
- npm run test:e2e passed all 11 scenarios, including the actual local Wrangler runtime, denied anonymous/encoded staff routes, private worker exclusion, legacy redirects, unknown/stale status, viewer permissions, keyboard navigation, report escaping/session revocation, verified-player warning requests, approved-model requests, and narrow viewports. Browser action data was explicitly synthetic test data.
- npm audit --omit=dev --audit-level=high reported zero vulnerabilities. Generated contracts were refreshed from the runtime schemas.
- Visually inspected desktop/mobile status and desktop staff-model layouts. Existing roadmap data and published transmissions are unchanged.
- A separate reviewer could not read the filesystem because of the Windows sandbox error. A bounded review was completed using supplied gateway, Access, CSRF, routing, and response-filtering source excerpts; no material issues were identified within that boundary. It was not an independent runtime or full-repository security audit.
- Runtime testing caught and repaired a Wrangler multipart-output mismatch; the final build uses an advanced-mode _worker.js directory. Added a real 404 page and repaired case-colliding tag archives so existing posts remain reachable.
- Deployment remains disabled. No push, deployment, DNS change, or production operation was performed.

## External acceptance still required

Obtain the approved hostname, environment-specific Access applications/audiences, protected GitHub environments, runtime secrets, and Kinetic/main-server project configuration. Implement the shared backend contracts and independent per-action authorization in those projects, then perform staging tests with real staff identities and audited operations. The local website result does not establish live backend readiness, production login, report-retention enforcement, or successful deployment.
