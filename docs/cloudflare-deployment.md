# Cloudflare Pages deployment and rollback

This replaces the earlier GitHub Pages deployment plan. Local implementation does not authorize deployment, DNS changes, or production operations.

## Local commands

- `npm ci`: install the lockfile.
- `npm run verify`: types, contracts/content tests, Astro build, compiled Pages Functions, generated links and draft exclusion.
- `npm run test:e2e`: browser acceptance checks against the built Astro site plus the compiled local Pages runtime; install Chromium with `npx playwright install chromium` first.
- `npm run preview:pages -- --port 8788`: loopback-only Pages runtime, including authentication middleware. With no configuration, public status returns 503 and staff routes deny access.
- `npm run preview -- --port 4173`: static UI preview only. This does not execute authentication Functions. Never expose it to a network.
- `npm run admin`: existing loopback repository editor at `http://127.0.0.1:4321/admin/content/`.

Default canonical URL is local-only. Set the non-secret `SITE_URL` to the approved HTTPS website origin for a release build. The Cloudflare site uses root paths. Legacy `/Wilderness-Odyssey/*` paths redirect on the new host; legacy HTML entry points remain present. Redirecting the old github.io host requires a separately approved old-site update.

## One deployment owner

Keep `.github/workflows/deploy-site.yml` as the only website workflow. Create a Pages Direct Upload project, with `website` as its production branch. Do not enable Cloudflare Git builds or another auto-deployment workflow.

All PRs receive checks only. Reviewed work can be pushed to a trusted `preview/**` branch for an approval-gated preview. The `website` branch targets production. Manual dispatch is available only if GitHub exposes this workflow; the repo's default branch contains modpack work, so do not assume dispatch is available.

Deployments remain disabled unless the repository variable `ENABLE_PAGES_DEPLOYMENTS` is explicitly set to `true`. Do not enable it until the owner approves deployment and the following setup is complete.

## GitHub protection

Create `cloudflare-production` and `cloudflare-preview` environments with required reviewers and deployment branch restrictions. Production permits only `website`; preview permits trusted `preview/**` branches. Prevent self-review when available. Protect website merges and review changes to workflow, gateway, and deploy scripts. If the GitHub plan does not support the required approval protection, leave deployment disabled until an equivalent approval process is agreed.

The deploy job downloads the tested artifact, checks the branch has not advanced, installs an isolated pinned Wrangler, and publishes after approval. Application dependencies/build scripts never receive the deployment token. Environment configuration is prepared from non-secret GitHub variables. The workflow publishes no public Lighthouse reports or authenticated screenshots.

GitHub environment secrets:
- `CLOUDFLARE_ACCOUNT_ID`
- `CLOUDFLARE_API_TOKEN`: account-scoped Pages Edit, no DNS privileges. Do not assume this token is project-scoped.
- `PREVIEW_ACCESS_CLIENT_ID`, `PREVIEW_ACCESS_CLIENT_SECRET` for read-only checks of protected deployment URLs. Both GitHub environments need these verifier secrets because production deployments also have generated preview URLs. This identity cannot access staff records.

Repository variable: `SITE_URL` for the build's canonical public URL. It must match the environment value; deployment preparation rejects an artifact built for a different origin.
Environment variables:
- `CLOUDFLARE_PAGES_PROJECT`
- `SITE_URL`: approved production verification origin
- `ALLOWED_HOSTS`: comma-separated exact staff hostnames. Production must include canonical and production pages.dev hostnames. Preview may use `*.PROJECT.pages.dev`; that wildcard is accepted only in preview.
- `ACCESS_TEAM_DOMAIN`: exact `https://TEAM.cloudflareaccess.com`
- `ACCESS_AUDIENCE`: audience of that environment's staff/preview application
- `PUBLIC_STATUS_URL`: the bot's sanitized status endpoint, including its path
- `KINETIC_ADMIN_ORIGIN`: HTTPS origin only, with no path or credentials
- Preview only: `PREVIEW_VERIFY_SERVICE_ID`: the preview verifier service token's exact signed `common_name` identity

Runtime secrets go directly into the corresponding Pages production or preview environment, never into PUBLIC_ variables or built assets:
- `KINETIC_ACCESS_CLIENT_ID`
- `KINETIC_ACCESS_CLIENT_SECRET`
- `CSRF_SECRET`: independently generated random value of at least 32 bytes

Use distinct preview and production runtime credentials and audience values. Preview must point to a staging backend with synthetic test records, not production moderation data. Pages preview bindings are shared by preview branches. Only reviewed trusted code may be deployed with those bindings.

`wrangler.jsonc` is intentionally unconfigured in the repository. The deployment helper fills only the selected environment's non-secret values; runtime secrets remain in Cloudflare. Local `.dev.vars` is ignored. `.dev.vars.example` lists required secret names without values.

## Access protection before the first preview

1. Configure the approved staff identity provider and staff admission policy, with MFA as appropriate.
2. Protect production `/admin`, `/admin/*`, `/api/admin`, and `/api/admin/*` on every production hostname. Use one application audience covering those paths, or explicitly revise the trust model before adding another application.
3. Enable Access for all preview deployment URLs and branch aliases. The Pages preview toggle does not also protect the production pages.dev hostname or custom domain.
4. Add a service-auth policy for the preview smoke-check identity. The Function accepts that exact signed service identity for public preview pages only, never staff pages or staff APIs.
5. Configure Pages to fail closed if Functions cannot run. Do not use fail-open static fallback for staff protection.
6. Verify that Kinetic's private administration application requires its separate service credential and validates both signed assertions described in `api-integration.md`.
7. Block direct-origin access that would bypass the intended machine-authentication boundary. Raw Minecraft/RCON/Ollama management ports must not become web endpoints.

The Functions invocation rule intentionally covers all paths to enforce whole-preview authentication, including static assets. This means public assets also traverse middleware; account usage must be assessed before rollout.

## Verification and cutover

A successful deployment job requires the Cloudflare deployment record for the exact commit and branch, matching revision.json, public page responses, supported status API output, and denial of staff pages/API across the canonical domain, production pages.dev hostname, generated deployment URL, and returned branch aliases to unauthenticated callers or the preview verifier. A disconnected status source may return a safe 503; this is different from an unhealthy website deployment.

Before production approval also perform real-user tests for Viewer, Moderator, and Administrator; wrong-audience rejection; disabled/revoked staff; model/service allowlists; report retention; and staging mutation audit records. CI service credentials cannot prove the real staff login flow.

Do not modify production DNS until explicitly approved. Keep the old published site available during validation. Snapshot the previous deployment ID and configuration without exporting secret values. Any old-host redirect must be reviewed as a separate cutover step.

## Rollback

With owner approval, restore the previous known-good Pages deployment in Cloudflare. Confirm its commit, public pages, Access denial, and backend compatibility. Reverting website code does not reverse backend moderation records or completed service/model operations. Those remain audited backend operations requiring their own authorized recovery. Roll back DNS only if it was changed and the owner approves that rollback.

## Local editor publication status

Draft saves remain local. Publishing commits only the selected transmission and referenced images. `checks-passed` means checks completed without a verified production deployment. `awaiting-approval` and `deploying` are not publication. The editor reports `published` only after the matching workflow and cloudflare-production deployment have both succeeded and a secure environment URL is available.