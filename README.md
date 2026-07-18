# Wilderness Odyssey website

This branch contains the static Astro website for **Wilderness Odyssey: The World Reborn**. It is deliberately isolated from the modpack branches and publishes to:

`https://thunderrock424242.github.io/Wilderness-Odyssey/`

The site uses one validated Astro content collection, `transmissions`, for news, blog posts, development logs, patch notes, lore records, and announcements. A post is written once and can then appear on its type archive, tag pages, the homepage, RSS, search results, roadmap links, and its permanent transmission page.

## 1. Requirements

- Node.js 24 (Astro 7 requires Node 22.12 or newer)
- npm, included with Node
- Git when publishing from a local checkout

No database, CMS, API key, Discord token, or hosted search service is required.

## 2. Local setup

Clone the repository, switch to the website branch, and install the locked dependencies:

```bash
git clone https://github.com/Thunderrock424242/Wilderness-Odyssey.git
cd Wilderness-Odyssey
git switch website
npm install
```

Use `npm ci` instead of `npm install` in CI or whenever you want an exact clean install from `package-lock.json`.

## 3. Development server

```bash
npm run dev
```

Open the URL Astro prints. The project has `base: "/Wilderness-Odyssey"`, so the local page is normally under `/Wilderness-Odyssey/`, not the server root.

## 4. Production build

Run the complete local quality gate:

```bash
npm run verify
```

Or run its parts separately:

```bash
npm run check
npm run test
npm run build
node scripts/check-built-site.mjs
```

`npm run check` validates Astro types, every transmission schema, roadmap references, draft examples, and required content. The production files are written to `dist/`.

## 5. Previewing the build

```bash
npm run preview
```

Preview the generated site at the printed `/Wilderness-Odyssey/` URL. Re-run `npm run build` after source changes because preview serves the existing `dist/` directory.

## 6. Creating a blog post

The easiest path is the interactive generator:

```bash
npm run new:post
```

Choose `blog`, answer each prompt, and leave `Draft` as `y` while writing. The command creates one Markdown file in `src/content/transmissions/`. Replace its placeholder paragraph with the post, run `npm run check`, preview it, then change `draft: true` to `draft: false` when it is ready.

Blog posts automatically appear at `/blog/`, `/transmissions/<slug>/`, matching tag pages, search results, RSS, and eligible homepage feeds.

## 7. Creating a development log

Run `npm run new:post` and choose `devlog`. Use a concise engineering title, describe verified work rather than planned claims, add the relevant modpack `version`, and set `relatedRoadmapItem` manually if it belongs to a roadmap track.

Example:

```yaml
relatedRoadmapItem: "water-system"
```

The ID must exist in `src/data/roadmap.ts`. Development logs appear in the dedicated engineering archive and can be linked from roadmap cards.

## 8. Creating patch notes

Run `npm run new:post`, choose `patch`, and always fill in the version prompt. Write the body with clear headings such as `Added`, `Changed`, `Fixed`, and `Known limitations`. Patch records are grouped by the version filter on `/patches/`.

## Post template and fields

Copy `templates/transmission.md` when you do not want to use the generator. The authoritative schema lives in `src/content.config.ts`.

Required fields are `title`, `description`, `publishedAt`, `type`, `author`, and at least one tag. Supported types are `news`, `blog`, `devlog`, `patch`, `lore`, and `announcement`. Optional fields include `updatedAt`, `coverImage`, `featured`, `draft`, `version`, `relatedRoadmapItem`, and `galleryImages`.

Images referenced by frontmatter use a site-root path such as `/images/transmissions/water-system.webp`; the shared URL helper adds the GitHub Pages base at render time.

## 9. Adding roadmap items

Edit `src/data/roadmap.ts`. Each item has an ID, category, status, progress, priority, dependencies, milestone, tasks, exit conditions, and related transmission IDs. Supported statuses are:

- Planned
- Research
- In Development
- Testing
- Blocked
- Complete

Do not add a speculative calendar date as a guaranteed release date. Run `npm run check` after changing IDs or related transmissions.

## 10. Adding gallery images

1. Put an optimized `.webp`, `.avif`, `.jpg`, or `.png` file under `public/images/gallery/`.
2. Add or update the item in `src/data/gallery.ts`.
3. Set `image` to a site-root path such as `/images/gallery/anomaly-storm.webp`.
4. Add accurate `alt` text, caption, category, version, and optional lore or related transmission.
5. Run the production build and test the filter, dialog, arrow keys, and Escape key.

Items without an image intentionally render as clearly marked archive placeholders. Do not label concept art as an in-game screenshot.

## 11. Using drafts

Set `draft: true` while working. Drafts are excluded from production routes, archives, search data, RSS, related posts, and the homepage. The six files under `src/content/transmissions/_examples/` demonstrate every transmission type and stay excluded because they are drafts.

Before publishing, set `draft: false`, use a real publication date, and run `npm run verify`.

## 12. Publishing through GitHub

The website lives on the `website` branch; the repository default branch contains modpack work. Always target `website` when opening a website pull request.

Local Git workflow:

```bash
git switch website
git pull --ff-only origin website
git switch -c site/my-transmission
# add or edit content
npm run verify
git add src/content/transmissions public/images
git commit -m "Add water system development log"
git push -u origin site/my-transmission
```

Open a pull request with base branch `website`. Merging it triggers the Pages workflow.

### GitHub browser editor

1. Open the repository on GitHub and select the `website` branch.
2. Open `src/content/transmissions/`.
3. Choose **Add file → Create new file**.
4. Name it with a lowercase hyphenated slug ending in `.md`.
5. Copy `templates/transmission.md`, fill in every required field, and write the body.
6. If needed, upload images under `public/images/transmissions/` and reference them with `/images/transmissions/<file>`.
7. Choose **Create a new branch for this commit and start a pull request**.
8. Confirm the pull request base is `website`, let the checks pass, review the preview locally if needed, then merge.

Do not paste tokens or credentials into Markdown, frontmatter, client scripts, GitHub comments, or repository files.

## 13. GitHub Pages deployment

`.github/workflows/deploy-site.yml` follows Astro's official Pages action pattern. On a push to `website`, or a manual workflow dispatch, it:

1. checks out `website`;
2. installs the locked npm dependencies;
3. validates content and TypeScript;
4. runs focused tests;
5. builds and verifies the `/Wilderness-Odyssey/` artifact;
6. checks generated internal links and records a Lighthouse report;
7. uploads with `withastro/action`;
8. deploys with `actions/deploy-pages`.

In repository **Settings → Pages**, set **Source** to **GitHub Actions**. No deployment is performed merely by running the site locally.

## 14. Updating site settings

Edit `src/data/site.ts` for the name, tagline, current status, versions, download status, featured transmission, external links, social metadata, and footer. Do not invent an exact NeoForge build or public download URL; use an honest status until one is published.

Feature summaries live in `src/data/features.ts`, survivor records in `src/data/survivorLogs.ts`, and navigation is centralized beside the site settings.

## 15. Future Discord bot publishing contract

The future integration contract is documented in `docs/discord-publishing-contract.md` and machine-readable at `docs/transmission-publishing-contract.schema.json`.

The recommended bot flow is: validate a proposed payload, create a Markdown file and optional images on a short-lived branch, run `npm run check`, then open a pull request targeting `website`. The website does not expose a webhook or credentials and does not require the bot to build.

## 16. Troubleshooting base-path issues

- A local link that starts with `/roadmap/` bypasses the project base. Use `withBase('/roadmap/')` from `src/lib/urls.ts` in components and scripts.
- Content image fields intentionally begin with `/images/`; rendering components pass them through the same helper.
- Open `/Wilderness-Odyssey/` during local preview. A 404 at `/` does not mean the project route failed.
- Run `node scripts/check-built-site.mjs`; it rejects non-base-aware generated links and missing local assets.
- If GitHub Pages shows unstyled HTML, confirm `site` and `base` in `astro.config.mjs`, that the workflow ran from `website`, and that Pages Source is **GitHub Actions**.
- If a transmission fails validation, read the exact `npm run check` field error and compare it with `templates/transmission.md`.
- If Astro tries to write telemetry settings in a restricted Windows environment, run the command with `ASTRO_TELEMETRY_DISABLED=1` set for that shell.

## Useful commands

| Command | Purpose |
| --- | --- |
| `npm install` | Install or refresh local dependencies |
| `npm run dev` | Start the Astro development server |
| `npm run check` | Validate types, schemas, references, and examples |
| `npm run test` | Run focused behavior tests |
| `npm run build` | Generate the static production site |
| `npm run preview` | Serve the generated site locally |
| `npm run new:post` | Create a validated transmission interactively |
| `npm run verify` | Run the full local quality gate |

