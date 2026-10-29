# Editable Deployment Configuration Implementation Plan

> **For agentic workers:** Use superpowers:executing-plans to implement this plan in this session. The owner approved the design and requested implementation.

**Goal:** Manage non-secret website deployment settings in one commented file, with useful validation.

**Architecture:** A dependency-free Node loader combines shared settings, selected-environment settings, and nonempty environment overrides. Build, deployment preparation, and verification consume that loader; secrets stay in their existing bindings.

**Tech Stack:** Node ESM, JSONC, Astro, GitHub Actions, Vitest, Playwright.

**Spec:** `docs/superpowers/specs/2026-10-28-editable-deployment-config-design.md`

## Global Constraints

- Preserve root paths, legacy redirects, authentication checks, deployment enablement, and approval gates.
- Do not invent the owner's missing Discord guild ID or deploy anything.
- Deployment helpers must work without application dependencies.
- Nonempty environment variables override file values; empty variables do not erase them.

## Review Focus

- JSON comments must not corrupt HTTPS URLs or quoted strings.
- Misspelled keys and numeric Discord IDs must produce useful errors.
- Unknown keys and non-string file values must fail even when environment overrides exist; validate string formats after applying the documented precedence.
- Invalid configuration must not modify Wrangler or print raw values.
- Build metadata and Astro must resolve the same canonical URL.

### Task 1: Editable file and shared loader

**Files:** `config/deployment.jsonc`, `scripts/deployment-config.mjs`, `scripts/check-deployment-config.mjs`, `tests/deploymentConfig.test.ts`, `package.json`.

**Interfaces:** `readDeploymentSettings({ environment, env, configPath })` returns the selected, normalized non-secret settings; `validateDeploymentSettings(settings, environment)` returns all validation messages; `getSiteUrl(options)` returns the configured URL or the existing local default.

- [x] Write subprocess and loader tests covering missing settings, JSONC strings/comments, precedence, environment separation, typo/type errors, URL safety, and secret exclusion.
- [x] Run the tests and confirm the new behavior fails before implementation.
- [x] Implement the commented file, dependency-free loader, validation CLI, and `config:check` script.
- [x] Run the focused tests and confirm success.

### Task 2: Integrate build and deployment

**Files:** `astro.config.mjs`, `scripts/build-pages.mjs`, `scripts/configure-pages.mjs`, `scripts/verify-deployment.mjs`, `.github/workflows/deploy-site.yml`, deployment/setup documentation, `tests/deploymentConfig.test.ts`.

**Interfaces:** Consume Task 1's loader and validators. Configure Pages only after complete validation and matching artifact origin; export the resolved project name for the existing deployment shell command.

- [x] Write failing integration tests for file-only configuration, environment selection, origin mismatch, safe diagnostics, and unchanged Wrangler output after invalid configuration.
- [x] Update the consumers and workflow, preserving protected deployment gates and existing environment overrides.
- [x] Document settings, precedence, secret storage, and the Discord ID setup steps.
- [x] Run `npm run verify` and `npm run test:e2e`; inspect production preview, Pages root/legacy routes, and the diff.

## Execution notes

- Work in the current `website` checkout so the editable result remains in the user's workspace. Do not create commits or deploy without a request.
- Execute inline; the owner's instruction to start implementation supersedes another plan-approval handoff.
- Ruling: validate file structure before overrides and effective value formats afterward. The initial review-focus sentence about all invalid source values was too broad: the approved spec makes nonempty environment variables authoritative, so an override must be able to replace a stale string value. A regression test covers both failure without an override and success with a valid override.
- Review corrected configuration overrides to step scope in GitHub Actions so protected-environment variables are available. Parsed the final workflow as YAML and checked the three consumers' override mappings.
- Verification: clean type checks, full unit suite, production build and link checks; 74 browser tests passed, including desktop/mobile, keyboard navigation, Pages root/legacy redirects, console-error assertions, and protected staff routes. Inspected generated desktop/home and mobile/status screenshots. Live deployment and provider setup remain outside this change.
