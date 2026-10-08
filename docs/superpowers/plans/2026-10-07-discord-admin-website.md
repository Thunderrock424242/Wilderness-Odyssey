# Discord Admin Website Implementation Plan

> Execute inline in this chat using the planning, test-driven development, and verification skills. The user authorized website implementation and a separate bot handoff message; do not edit the bot branch or deploy.

**Goal:** Implement Discord login, secure session transport, and dashboard controls on the website, with an exact contract for the bot backend.

**Architecture:** Pages Functions broker fixed authentication endpoints to Kinetic using machine Access credentials. Kinetic owns Discord OAuth, enrollment, session revocation, and current Administrator checks. The website uses host-only HttpOnly cookies and a session-bound CSRF token; unconfigured or incompatible backends deny access.

**Tech Stack:** Existing Astro, Pages Functions, Zod, jose, Vitest, and Playwright.

**Spec:** `docs/superpowers/specs/2026-10-07-discord-admin-sign-in.md`.

## Constraints and decisions

- Only website source and documentation change; the bot receives a copyable implementation message.
- Use explicit `STAFF_AUTH_MODE=discord`; preserve legacy Access only with an explicit `access` setting. Never fall back after Discord failure.
- Require the approved HTTPS callback URI and Discord guild ID as non-secret runtime configuration.
- Keep OAuth attempts at five minutes and sessions at fifteen minutes. Exclude all credentials from browser JSON and logs.
- Preserve preview Access protection, existing administrative capability limits, mutation validation, and local content-editor isolation.
- Leave changes uncommitted for review. User authorization to implement takes precedence over redundant planning confirmation gates.

## Review focus

- OAuth redirect URLs or duplicate query fields must not create an open redirect.
- Duplicate or forged cookie/header values must not choose a different session identity.
- Logout must work with an expired authorization and clearly report failed server revocation.
- Preview verifier identities must not reach any staff authentication route.
- Unsupported backend responses and outages must deny access and remain understandable.

## Tasks

- [x] Add failing tests for authentication start/callback cookies, safe redirects, backend errors, session authorization, session-bound CSRF, and logout. Exercise actual middleware and gateway behavior with a bounded fake upstream.
- [x] Define runtime schemas in `contracts/v1/auth.ts`; implement cookie helpers, host validation, authentication routes, and session resolution in focused server modules. Use the existing Kinetic client and preserve its sanitization and limits.
- [x] Wire authentication into middleware and the administrative gateway. Add `/login/`, Discord-specific expired-session links, and CSRF-protected sign-out; preserve staff pages and capability behavior.
- [x] Update generated contract export, runtime variables/types, deployment configuration, built-site checks, and integration documentation. Write `docs/discord-admin-bot-codex-message.md` with the exact bot endpoint payloads, headers, permission rules, and tests.
- [x] Run `npm run verify` and `npm run test:e2e`; inspect login desktop/mobile screenshots, keyboard behavior, navigation, error states, and browser console. Review the final diff and report local verification separately from real Discord/backend integration.

## Completion evidence

- `npm run verify`: zero TypeScript diagnostics, 111 passing unit tests, successful static site and Pages worker compilation, browser credential-exposure checks, and 58 generated HTML files checked for routes, links and assets.
- `npm run test:e2e -- --output=.codex-build/discord-auth-browser-final`: all 49 browser tests passed, including the four Discord login/sign-out cases and compiled Pages protection/legacy-redirect checks.
- Inspected desktop and 390px login screenshots; keyboard navigation, accessibility audit and browser console checks passed.
- Read-only authentication review found deployment redirect handling, logout timeout and alternate production host issues. Each was reproduced, corrected and covered by regression tests; final review reported no material findings.
- Reviewed the focused source diff and preserved concurrent public UI/service-page edits. `git diff --check` passed. Changes remain uncommitted and undeployed.
- Bot commands, OAuth storage/exchange, enrollment, current Discord permission checks and live integration remain the separate bot implementation described in the handoff. Local verification uses synthetic backend responses and does not prove real Discord login.
