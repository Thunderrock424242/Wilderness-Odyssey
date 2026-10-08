Repository Guidelines

Project Purpose

This repository contains the public Wilderness Odyssey website and related browser-facing interfaces.

The site is an Astro static application deployed on Cloudflare Pages, with Pages Functions for authenticated backend integration. GitHub Pages URLs are legacy compatibility routes.

Primary responsibilities include:

* Public Wilderness Odyssey information.
* Project news and blog content.
* Gallery/media pages.
* Documentation and project information.
* Public server-status presentation.
* Login and permission-aware UI where applicable.
* Administrative dashboard interfaces that communicate with trusted backend services.

Keep privileged server operations, Discord bot logic, Minecraft administration, Ollama model control, secrets, and other trusted backend responsibilities outside the static frontend.

The website may display and request privileged functionality, but authorization and execution must occur through trusted authenticated backend services.

Project Structure & Module Organization

Astro route entry points live in src/pages/, reusable components in src/components/, and shared document layouts in src/layouts/.

Shared styling lives in src/styles/, including global.css, original-parity.css, and operations.css.

TypeScript application code lives under src/.

Keep responsibilities separated:

* src/content/ — Astro content collections for transmissions and roadmap records.
* src/data/ — shared site copy, features, gallery records, roadmap tracks, and survivor logs.
* src/scripts/ — browser interaction modules such as terminal.ts and pageEffects.ts.
* src/lib/ — reusable presentation helpers and browser API clients.
* contracts/v1/ — versioned API schemas shared by the browser and gateway.
* server/ and functions/ — trusted Pages gateway code; keep it out of browser bundles.
* scripts/ — build-time and generation helpers.
* public/ — static assets copied directly to the built site.

Astro generates route HTML, feeds, and sitemaps in dist/. scripts/build-pages.mjs adds the compiled Pages worker, route configuration, and revision metadata. npm run contracts:export regenerates contracts/v1/schemas.json from the TypeScript schemas.

Treat dist/ as disposable build output.

Do not manually maintain generated output when its source exists elsewhere.

Build, Test & Development Commands

Use the repository scripts already defined in package.json.

Primary commands:

* npm ci installs the exact dependency versions from package-lock.json.
* npm run dev starts Astro on 127.0.0.1.
* npm run check runs Astro and gateway TypeScript checks plus content validation.
* npm test runs the Vitest suite.
* npm run build generates the static Astro site and compiles the Pages gateway.
* npm run preview -- --port 4173 serves the production build locally.
* npm run preview:pages -- --port 8788 serves the compiled Cloudflare Pages runtime locally.
* npm run verify runs checks, unit tests, the build, and generated-site link checks.
* npm run test:e2e runs Playwright against the static preview and Pages runtime.
* npm run admin starts the separate loopback-only local content editor.

The production preview is expected under:

http://127.0.0.1:4173/

astro.config.mjs uses base: '/'. Legacy /Wilderness-Odyssey/ paths redirect through public/_redirects.

Preserve both the Cloudflare root-path contract and legacy redirects. The static preview does not enforce staff authentication; use the Pages runtime to validate the gateway.

Automated unit tests live in tests/ and browser tests in tests/browser/.

Before considering a website change complete:

1. Run npm run verify and npm run test:e2e.
2. Resolve all TypeScript errors.
3. Preview the production build.
4. Inspect all directly affected pages.
5. Check internal navigation.
6. Test keyboard behavior for interactive elements.
7. Test narrow/mobile layouts.
8. Verify root-path behavior and legacy redirects in the Pages runtime.
9. Check browser console output for unexpected errors.

The deployment workflow also checks generated internal links and production dependencies. Deployment remains gated by the configured protected environments and owner approval.

Aim to keep accessibility, best-practices, and SEO scores at or above 0.90.

Coding Style & Naming Conventions

Match nearby code.

Use:

* two-space indentation,
* single-quoted TypeScript strings,
* semicolons,
* trailing commas in multiline objects.

Naming conventions:

* camelCase for functions and variables.
* PascalCase for types, interfaces, and classes.
* UPPER_SNAKE_CASE for exported content collections or true constants.
* camel-cased TypeScript data and interaction files such as survivorLogs.ts.
* kebab-cased page files such as patch-notes.html.

TypeScript runs in strict mode.

Avoid:

* unnecessary any,
* unused variables,
* unused parameters,
* switch fallthrough,
* unsafe type assertions,
* duplicated logic,
* giant modules containing unrelated behavior.

There is no configured formatter or linter, so avoid broad formatting changes and follow the surrounding code style.

Page Architecture

Treat each page as an entry point with shared reusable behavior.

Do not duplicate common functionality across multiple HTML pages when it belongs in shared TypeScript or CSS.

Prefer:

* shared rendering functions,
* reusable components/helpers,
* centralized content records,
* focused interaction modules.

Avoid moving large amounts of page content directly into TypeScript unless doing so improves maintainability or supports data-driven rendering.

Content changes should generally remain separate from behavior changes.

Content Management

Structured copy and project records belong in src/content/ when possible.

Prefer changing source content rather than editing generated HTML or generated share pages.

For blog changes:

* update the source records,
* run the appropriate generation/build script,
* verify generated share pages,
* verify social metadata where relevant.

Do not edit generated blog output as the source of truth.

Accessibility

Accessibility is a required part of implementation rather than a final polish step.

Interactive elements should:

* work with a keyboard,
* have visible focus behavior,
* use semantic HTML,
* expose meaningful labels,
* avoid relying only on color,
* respect reduced-motion preferences where practical.

Use actual buttons and links for interactive actions instead of clickable generic containers when appropriate.

Images should have meaningful alt text unless they are purely decorative.

Do not remove existing accessibility behavior to achieve a visual effect.

Mobile & Responsive Design

Changes must work on both desktop and mobile layouts.

Avoid:

* fixed widths that overflow small screens,
* hover-only functionality,
* tiny interaction targets,
* text that becomes unreadable at narrow widths,
* absolute positioning that breaks page flow.

When adjusting layouts, inspect at least one narrow mobile viewport and one normal desktop viewport.

Preserve existing responsive behavior unless the task explicitly calls for redesigning it.

Performance

The public site should remain lightweight.

Avoid adding large libraries for functionality that can be implemented simply with existing browser APIs or current dependencies.

Prefer:

* deferred or lazy work,
* optimized images,
* minimal JavaScript on pages that do not require it,
* event-driven behavior,
* reusable assets,
* cached API responses where appropriate.

Avoid continuous polling when slower refresh intervals or event-driven updates are sufficient.

Do not add expensive page effects that noticeably hurt mobile performance or accessibility.

Cloudflare Pages Deployment and Legacy URLs

The public site is deployed through Cloudflare Pages.

Treat the configured base path as part of the deployment contract.

The current base is /. Preserve the former /Wilderness-Odyssey/ URLs and HTML aliases as redirects.

When adding links, assets, or dynamically generated paths:

* respect astro.config.mjs and the shared withBase helper,
* keep legacy redirects pointing to the corresponding current route,
* verify generated URLs in production preview.

Call out any change that modifies:

* astro.config.mjs,
* GitHub Actions deployment,
* public paths,
* generated assets,
* custom-domain behavior.

Cloudflare & Authentication

Cloudflare may provide access-control or security layers for administrative website functionality.

Do not treat frontend visibility as authorization.

Hiding a button, route, menu item, or page in the browser does not secure the underlying operation.

Authentication and authorization for privileged actions must be validated by a trusted service.

Frontend code may:

* determine which controls to display,
* present login state,
* request authenticated operations.

Frontend code must not be the final authority for:

* staff permissions,
* server administration,
* player moderation,
* Discord administration,
* AI/model administration,
* Minecraft administrative actions.

Never embed Cloudflare secrets or privileged credentials into browser bundles.

Admin Dashboard

The website admin dashboard may expose interfaces for:

* server management,
* player moderation,
* AI conversation moderation,
* AI model management,
* maintenance controls,
* service-health monitoring.

Treat the dashboard as an interface to backend services, not as the backend itself.

Admin actions should flow through authenticated APIs.

The frontend must not directly connect to privileged internal services using embedded credentials.

Administrative UI should clearly distinguish between:

* loading,
* success,
* permission denied,
* offline/unreachable,
* malformed response,
* server-side failure.

Avoid displaying raw internal errors, stack traces, secrets, private headers, or backend implementation details.

Backend API Integration

Browser-side API calls belong in focused modules rather than being scattered throughout page code.

Where practical, use a dedicated service layer such as:

src/services/

API clients should:

* validate expected response shapes,
* check status codes,
* handle timeouts,
* handle unavailable services,
* avoid unlimited retries,
* surface understandable errors to the UI.

Do not assume the Minecraft server, Discord bot, backend API, or Ollama service is always online.

Public pages should degrade gracefully when live information cannot be retrieved.

Do not directly expose private service addresses unless they are intentionally public endpoints.

Server Status Features

Status pages should separate presentation from data retrieval.

Status data may include:

* Minecraft server online/offline state,
* player count,
* version information,
* TPS/MSPT where intentionally exposed,
* Aether service availability,
* response latency,
* maintenance state,
* Discord integration status.

Do not expose:

* internal IP addresses,
* administrative ports,
* credentials,
* authentication headers,
* private logs,
* infrastructure details unnecessary to the user.

Use short-lived caching where appropriate to avoid excessive backend requests.

Ollama / Aether Interfaces

The browser must not communicate directly with a privileged Ollama instance unless a deliberately public, secured gateway has been designed for that purpose.

Aether/Ollama requests should normally pass through a trusted backend.

Do not expose:

* model-administration credentials,
* unrestricted model endpoints,
* system prompts intended to remain private,
* internal service URLs,
* moderation controls without authorization.

AI-related UI should gracefully handle:

* model unavailable,
* request timeout,
* authentication failure,
* moderation rejection,
* malformed response,
* backend maintenance.

Security & Configuration

The deployed website is public client-side code.

Assume anything shipped in browser bundles can be inspected by users.

Never place secrets in:

* src/,
* HTML,
* public/,
* Astro PUBLIC_* environment variables,
* frontend JSON configuration,
* generated static files.

Never commit:

* Discord bot tokens,
* webhook URLs,
* Cloudflare API tokens,
* backend API secrets,
* Minecraft administration credentials,
* Ollama credentials,
* private keys,
* session secrets,
* .env files containing secrets.

Values intentionally exposed through PUBLIC_* variables must be safe for public disclosure.

Privileged integrations require a trusted backend.

If a secret has been committed, treat it as compromised and rotate it rather than only removing the latest occurrence.

Input & Output Safety

Treat API responses, URL parameters, stored content, and user-generated content as untrusted.

Avoid inserting untrusted text with innerHTML.

Prefer text-safe DOM APIs unless sanitized HTML is explicitly required.

Validate:

* URL parameters,
* IDs,
* API responses,
* navigation destinations,
* external links,
* JSON data.

Do not evaluate dynamically supplied JavaScript.

Do not construct unsafe HTML from externally controlled values.

External Links

External links should be deliberate.

For links opening new tabs, use appropriate rel protections.

Do not generate arbitrary external destinations from untrusted URL parameters.

Preserve clear link labels so users understand where an external link leads.

Error Handling

User-facing errors should be understandable and concise.

Avoid exposing technical details that are only useful to developers.

Detailed diagnostics may go to the browser console during development where appropriate, but do not leave noisy debugging output in production.

For API-backed UI, distinguish between:

* no data,
* loading,
* offline service,
* authorization failure,
* genuine error.

Do not present stale or failed data as current.

Codex Working Guidelines

Use the smallest useful context for the task.

Do not load or analyze the entire repository for every request.

Start with the files directly related to the requested change.

Examples:

For a blog change, inspect:

* the relevant content module,
* blog-generation script if necessary,
* rendering code directly involved.

For a UI interaction change, inspect:

* the affected page,
* its interaction module,
* relevant shared styles.

For an admin-dashboard change, inspect:

* the affected dashboard code,
* relevant API client,
* shared types,
* authentication/permission handling.

Expand outward only when dependencies require it.

Do not repeatedly re-read unrelated files already understood.

Prefer targeted searches over broad repository-wide reading.

Reuse existing abstractions and patterns before creating new ones.

Avoid large refactors while implementing a localized change.

When requirements are clear, implement the change instead of repeatedly requesting confirmation.

For substantial work:

1. inspect the smallest relevant area,
2. understand existing behavior,
3. identify directly affected dependencies,
4. implement the smallest coherent change,
5. run validation,
6. inspect the diff,
7. correct issues found during validation.

Do not generate placeholder code when the repository already contains enough context to implement the real behavior.

Codex Context Efficiency

Keep repository instructions concise and durable.

Do not copy large architecture documents into working context unless they are required for the current task.

Prefer referencing the relevant source file or documentation location.

Do not read:

* dist/,
* generated blog pages,
* large static assets,
* node_modules/,
* unrelated content collections

unless the task specifically requires them.

When investigating a bug, begin from the observed behavior and the most likely owning module rather than scanning every file.

Use higher reasoning effort for architecture, security, difficult debugging, and cross-service changes.

Routine content edits and localized styling changes should remain narrow in scope.

Generated & Dependency Files

Do not manually edit installed dependencies or generated build output.

Treat these as generated/disposable unless the repository explicitly says otherwise:

* node_modules/
* dist/
* generated blog share pages
* copied social assets
* temporary build artifacts

Make changes in source files and regenerate outputs through repository scripts.

Do not commit node_modules/.

Commit & Pull Request Guidelines

Recent commits use short, lowercase action phrases.

Use messages such as:

* fix mobile navigation
* update server status page
* add admin service health
* improve blog metadata
* secure admin api requests

Keep each commit focused on one visible outcome.

Avoid combining unrelated cleanup with feature work.

Before committing, inspect the diff for:

* accidental secrets,
* debug code,
* generated files that should not be committed,
* unrelated formatting changes,
* broken paths,
* unintended deployment changes.

Pull requests should:

* summarize the change,
* explain why it was made,
* list validation commands,
* link relevant issues,
* include before/after screenshots for visual changes,
* mention generated-file updates,
* call out changes to public paths or legacy GitHub Pages redirects,
* explain new backend/API requirements,
* note security or permission implications.

Change Safety

Preserve existing working behavior unless the requested change intentionally replaces it.

Do not delete pages, content, deployment logic, scripts, configuration, or integrations merely because they appear unused without verifying their purpose.

Be especially careful when modifying:

* astro.config.mjs,
* GitHub Actions,
* build scripts,
* generated blog behavior,
* base paths,
* authentication,
* Cloudflare integration,
* admin-dashboard APIs,
* CSP/security behavior,
* public asset paths.

For security-sensitive changes, favor explicit, auditable implementations over clever abstractions.
