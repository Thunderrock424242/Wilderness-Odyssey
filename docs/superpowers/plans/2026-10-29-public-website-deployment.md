# Public website deployment

The owner confirmed that the immediate goal is deploying the public website without first configuring Cloudflare Access or the bot/backend. This updates the earlier deployment-config design: connected administration is optional rather than a prerequisite for production publication.

## Design and approach

Add explicit `STAFF_AUTH_MODE: "disabled"` and select it in the editable file. Reuse the existing authentication-mode setting instead of adding a second switch that can conflict with it. Automatically inferring a public deployment from missing credentials would hide accidental connected-service configuration failures, so connected modes continue to require their existing settings.

Production in disabled mode requires only `SITE_URL` and `CLOUDFLARE_PAGES_PROJECT`; a public status endpoint is optional. Admin/authentication pages and APIs return a safe, uncached setup response before contacting any backend, even if stale credentials remain. No frontend visibility changes replace backend authorization.

The owner supplied `https://wilderness-odyssey.pages.dev/`; use that origin and its `wilderness-odyssey` Pages project name. In disabled production, derive permitted public hosts from the canonical URL and project hostname, plus any explicitly approved exact hostnames. Deny other deployment aliases even when Cloudflare gives them production bindings.

Preview environments retain whole-site protection. A disabled preview still requires Access configuration to serve public pages to its verifier. For production-only setup, generated deployment URLs may remain intentionally inaccessible: verify their denial without requiring preview service credentials, while verifying the exact production revision and public pages on the canonical and production Pages origins. Accept setup 503s only with an explicit disabled-mode marker; continue rejecting exposed previews and staff routes.

Keep root paths, redirects, deployment enablement, protected-environment approval, runtime secrets, and existing connected modes. Do not deploy or change live Cloudflare policies as part of this implementation. Preserve the owner's Discord guild ID and unknown deployment values.

## Implementation plan

1. Add failing config, middleware, gateway, and verification tests for disabled mode, optional integrations, unchanged connected requirements, and preview denial.
2. Implement mode-aware validation and explicit runtime guards. Strip unused administrative settings during public-only configuration preparation.
3. Update deployment verification to distinguish disabled staff responses and inaccessible generated previews from working connected services.
4. Update the editable comments, safe local template, generated binding types, and operator documentation.
5. Run focused tests, `npm run verify`, and `npm run test:e2e`. Review the diff and inspect narrow/desktop production-preview screenshots.

## Progress

- Regression tests failed before implementation; 88 focused tests pass. `npm run verify` passed clean type/content checks, all 180 unit tests, production build, browser-bundle checks, and generated-site link validation. `npm run test:e2e` passed all 75 browser tests, including disabled login/authentication, protected staff routes, root/legacy routing, mobile, keyboard behavior, and console-error assertions.
- Type generation and runtime acceptance tests exclude local `.env` files so unrelated bot settings cannot alter the default public-only template or generated website bindings. Ordinary developer previews retain their existing local configuration behavior.
- Regenerated binding types now contain only the website's configured fields. Independent review found no actionable defects. Production configuration validation succeeds for the owner's Pages URL/project, with backend/Access settings blank. No live deployment, GitHub variable, or Cloudflare policy was changed.
