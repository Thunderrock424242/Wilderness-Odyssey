# Repository Guidelines

## Project Structure & Module Organization

This repository is a multi-page Vite site. Root HTML files (`index.html`, `blog.html`, `gallery.html`, and similar) are page entry points, while shared styling lives in `style.css`. TypeScript application code is under `src/`; keep data-driven copy and records in `src/content/`, page rendering in `src/renderContent.ts`, and interaction logic in focused modules such as `terminal.ts` or `pageEffects.ts`. Build helpers live in `scripts/`. Static files belong in `public/`; `public/blog/` and `public/logo.png` are generated from `src/content/blogPosts.ts` and `logo.png`. Treat `dist/` as disposable build output.

## Build, Test, and Development Commands

- `npm ci` installs the exact dependency versions in `package-lock.json`.
- `npm run dev` regenerates blog share pages and starts Vite on `127.0.0.1`.
- `npm run build` runs strict TypeScript checks, generates share pages, builds every HTML entry, and copies social assets into `dist/`.
- `npm run preview -- --port 4173` serves the production build. Open `http://127.0.0.1:4173/Wilderness-Odyssey/`; the path prefix comes from `vite.config.ts`.

There is no automated unit-test suite. Before submitting, run `npm run build`, inspect affected pages in preview, and test keyboard and mobile behavior for interactive changes. The deployment workflow also checks internal links and records non-blocking Lighthouse results; aim for accessibility, best-practices, and SEO scores of at least 0.90.

## Coding Style & Naming Conventions

Use two-space indentation, single-quoted TypeScript strings, semicolons, and trailing commas in multiline objects. Follow existing naming: `camelCase` for functions and variables, `PascalCase` for types, and `UPPER_SNAKE_CASE` for exported content collections. Keep content modules camel-cased (`blogPosts.ts`) and page files kebab-cased (`patch-notes.html`). TypeScript is strict and rejects unused locals, unused parameters, and switch fallthrough. No formatter or linter is configured, so match nearby code.

## Commit & Pull Request Guidelines

Recent commits use short, lowercase action phrases such as `fix ...`, `update ...`, and `add ...`. Keep each commit focused and describe the visible outcome. Pull requests should summarize the change, list validation commands, link relevant issues, and include before/after screenshots for visual work. Call out generated-file updates and any changes to the GitHub Pages base path.

## Security & Configuration

The deployed site is static. Never place Discord bot tokens, webhook URLs, API secrets, or other credentials in `src/`, HTML, or Vite-exposed environment variables; privileged integrations require a trusted backend.
