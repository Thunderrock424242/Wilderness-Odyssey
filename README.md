# Wilderness Odyssey website

The `website` branch contains the Astro public site and staff dashboard for **Wilderness Odyssey: The World Reborn**. Minecraft 1.21.1 NeoForge and Ollama remain on the main server; the Discord bot and administration API remain on Kinetic Hosting.

The website is prepared for Cloudflare Pages deployment through the existing GitHub Actions workflow. **Deployment is disabled by default.** Nothing in local development deploys the site or changes DNS.

## Start locally

Use Node.js 24 and the locked dependencies:

```sh
npm ci
npm run dev
```

Open the loopback URL printed by Astro. Routes now start at `/`, rather than the former GitHub Pages subdirectory.

```sh
npm run verify
npx playwright install chromium
npm run test:e2e
npm run preview:pages -- --port 8788
```

`verify` checks Astro and gateway types, content, tests, the static build, compiled Pages Functions, internal references, and draft exclusion. Browser tests use controlled UI fixtures and the compiled local Pages runtime; they do not contact production.

The Pages preview runs the actual gateway. Missing configuration yields honest unavailable public status and denied staff access. `npm run preview` is only a static UI preview and does not execute authentication Functions; keep it on loopback.

## Public site

- The homepage retains the existing hero, lore, terminal, roadmap summary, content feeds, and community links.
- `/status/` shows Minecraft/Aether availability, player counts, TPS/MSPT, versions, maintenance, incidents, and measured inference latency.
- `/support/` and `/support/troubleshooting/` explain practical troubleshooting and reporting.
- `/news/`, `/patches/`, `/devlogs/`, `/blog/`, `/lore/`, gallery, RSS, tags, and permanent transmission URLs continue to use existing content.

Status comes only from the sanitized bot API through the same-origin gateway. Missing data is unavailable, expired data is labelled last-known, and fictional terminal text is separate from operational status. No examples are used as live data.

## Staff dashboard

Cloudflare Access protects the hosted staff interface. Pages Functions independently validate the assertion; Kinetic independently authenticates the gateway and authorizes each actor/action/resource.

- `/admin/`: Server Management.
- `/admin/players/`: verified player moderation and appeals.
- `/admin/reports/`: submitted AI reports and relevant excerpts.
- `/admin/models/`: approved installed models and permitted settings.

Viewer, Moderator, and Administrator are backend-assigned roles. Hidden buttons are not authorization. The gateway exposes no shell, RCON, arbitrary Ollama commands, or private upstream credentials. Staff responses are not cached. The dashboard does not retain all private conversations.

See [API contracts and integration](docs/api-integration.md) and [deployment, Access setup, and rollback](docs/cloudflare-deployment.md).

## Existing local content editor

```sh
npm run admin
```

Open `http://127.0.0.1:4321/admin/content/`. This starts the existing loopback-only repository service at port 4322.

- Save draft writes Markdown and approved images into this checkout.
- Publish/unpublish validates the site, commits only that transmission and referenced images, and pushes `website` using your existing Git credentials.
- Publication requires the `website` branch, exact sync with `origin/website`, and no unrelated staged files.
- Passing checks is not publication. The editor distinguishes checks passed, awaiting approval, deploying, and verified publication.
- Deployment still requires the configured approval gate.

Hosted `/admin/content/` does not connect to a remote publishing service. Real editing remains local. The development-only mock can be enabled with `PUBLIC_ADMIN_MOCK=true`; mock content never becomes a real save or deployment.

## Creating content

Run `npm run new:post` or copy `templates/transmission.md`. Supported types: news, blog, devlog, patch, lore, announcement. Leave `draft: true` until the content is reviewed.

The authoritative content schema is `src/content.config.ts`. Required fields are title, description, publishedAt, type, author, and tags. Optional fields include updatedAt, coverImage, featured, draft, version, relatedRoadmapItem, and galleryImages.

Use a lowercase hyphenated slug. Patch notes should include the relevant version, changes, and known limitations. Image references use site-root paths such as `/images/transmissions/slug/image.webp`. Keep accurate alt text. Draft examples under `_examples/` remain excluded from public routes, feeds, and search.

Write a post once: the collection places it into type/tag archives, permanent transmission pages, RSS, search, and eligible homepage feeds.

## Roadmap and gallery

Edit `src/data/roadmap.ts` for roadmap items. Preserve stable IDs, dependencies, milestones, tasks, exit conditions, and related transmission references. Progress is not a release-date promise. Validate with `npm run check`.

Add verified images under `public/images/gallery/` and update `src/data/gallery.ts`. Use truthful captions and alt text. Do not label concept art or placeholders as gameplay captures. Check filters and keyboard gallery navigation.

The public design reference is [visual-parity.md](docs/visual-parity.md). The cloud migration preserves that identity.

## Configuration and secrets

`.env.example` contains only non-secret local/build options. `SITE_URL` controls canonical URLs and defaults to loopback until an approved hostname is configured.

Runtime configuration and secrets belong in Cloudflare's separate production/preview environments. Never place secrets or private backend addresses in `PUBLIC_*` variables. The browser calls only relative gateway endpoints.

`wrangler.jsonc` has empty connection settings by design. Follow the deployment guide to configure Access audiences, allowed hosts, Kinetic endpoints, machine credentials, and CSRF signing. There is no production authentication bypass.

## Shared API contracts

```sh
npm run contracts:export
```

This exports `contracts/v1/schemas.json` from the same schemas used by the gateway. Both backend projects must implement and validate these contracts before live integration. The existing [Discord content publishing contract](docs/discord-publishing-contract.md) remains applicable to reviewed repository content.

## Deploying

Only `.github/workflows/deploy-site.yml` owns website deployments. PRs run checks. Reviewed `preview/**` branches can target protected previews; `website` targets production. Both require configured GitHub environment approvals and the explicit enable variable.

Do not enable Cloudflare Git auto-builds alongside this workflow. Do not deploy, change DNS, or modify production services without the owner's approval. Old github.io redirects and domain cutover are separate approved steps. See the deployment guide for precise configuration and verification.