# Bot gateway Worker implementation plan

> **For agentic workers:** Use superpowers:executing-plans to implement this focused addition inline.

**Goal:** Connect Pages to the existing Kinetic API through the private VPC service.

**Architecture:** A separate Worker forwards only versioned dashboard routes to a fixed loopback target through its VPC binding. It independently validates machine Access JWTs and environment before forwarding admin requests. Public status is projected through the existing schema.

**Tech Stack:** TypeScript, Wrangler, jose, Zod, Vitest; existing dependencies only.

**Spec:** Owner-approved gateway design in this chat and `docs/no-domain-login-options.md`.

## Global constraints

- Preserve Pages deployment, root routes, legacy redirects, and existing configuration edits.
- No deployment, live secret creation, or backend mutations in this implementation.
- Fixed service `01a1993c-5cfc-7310-a7b6-6b4677160389`, HTTP `127.0.0.1:25599`.
- Default deny admin while audience/service identity are empty. Discord authorization remains on the bot.

## Review focus

- Invalid signatures, expiry, wrong issuer/audience/service/environment must never reach the bot.
- Encoded paths, arbitrary destinations, redirects and unexpected methods must be denied.
- Upstream bodies and slow streams must be bounded; errors must not reveal internals.
- Request credentials/cookies must not leak through status, upstream headers, or errors.
- Upload and private download routes must retain their existing limits and no-store behavior.

### Task 1: Gateway and integration

**Files:** `workers/bot-gateway/{index.ts,routes.ts,transport.ts,wrangler.jsonc,worker-configuration.d.ts,tsconfig.json}`, `tests/botGateway.test.ts`, `docs/bot-gateway-setup.md`, `package.json`.

**Interfaces:** Export `handleBotGateway(request, env, dependencies?)`; inject only a JWKS resolver for signed-JWT tests. Use generated bindings and a fixed VPC destination.

- [x] Write tests for signed authentication, route/header isolation, status projection, bounded I/O, failures, and media.
- [x] Run focused tests and observe missing implementation failure.
- [x] Implement route selection, JWT verification, bounded transport, generated bindings and independent Worker configuration.
- [x] Run focused tests, type checks, dry-run packaging, `npm run verify`, and `npm run test:e2e`.
- [x] Review the diff and document remaining Access, bot, Pages and live staging setup.

## Execution notes

The current checkout has the owner's ongoing deployment configuration edits. Preserve them and implement the separately scoped Worker here; do not switch branches or commit unrelated work.

## Verification and review

- `npm run verify`: zero Astro/type diagnostics; 224 unit tests passed; website build, compiled Pages gateway, generated links and draft exclusion passed.
- `npm run test:e2e`: 75 browser/Pages-runtime tests passed.
- `npm run bot-gateway:smoke`: dry-run packaging and compiled workerd smoke checks passed using a synthetic local bot binding.
- Independent review found one important defect: authoring GET routes inherited a positive body limit. Added a regression, observed 415 instead of 200, corrected effective body limits, and verified the green full suite.
- Enrollment-error regression also demonstrated the missing safe error code before correction.
- Ruling: local runtime smoke uses the installed workerd-supported date `2026-10-23`, while deployment retains `2026-11-01`. The lockfile is unchanged; behavior under the newer date still needs live validation before staff activation.
- No deployment, live calls to the bot, Access policy creation, credentials, commits, or pushes were performed.
