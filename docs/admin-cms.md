# Wilderness Odyssey Admin CMS contract

## What the editor provides

The Astro site now builds a private-looking publishing workspace at `/admin/`. It can list, search, filter, compose, preview, validate, save, publish, unpublish, and delete transmissions through an injected Admin API. The editor writes the same Markdown frontmatter schema used by `src/content/transmissions/`, including cover art, tags, version, roadmap relationships, draft state, and `galleryImages`.

The browser does not receive a GitHub token and cannot write to the repository directly. GitHub Pages remains a static deployment target. Real editing is handled by the repository-owned loopback service started with `npm run admin`.

When no API URL is supplied, the production page shows an honest “uplink not configured” state. It does not expose a bypass or a fake login.

## Real local repository editor

From the repository's `website` branch, run:

```bash
npm run admin
```

The command starts the Astro site at `127.0.0.1:4321` and the repository service at `127.0.0.1:4322`. The admin workspace auto-authenticates as the local repository operator; it is not exposed to the network and does not need an admin password.

Draft saves write deterministic Markdown under `src/content/transmissions/` and uploaded image bytes under `public/images/transmissions/<slug>/`. Publishing or unpublishing:

1. requires the `website` branch and an exact match with `origin/website`;
2. refuses to continue if unrelated files are already staged;
3. runs `npm run verify` before creating a commit;
4. stages only the active transmission, a previous slug being removed, and images referenced by that transmission;
5. pushes to `origin/website` using the computer's existing Git credentials;
6. polls the public GitHub Actions result and reports `published` only after the Pages workflow succeeds.

Unrelated unstaged changes and other local drafts are left alone. Press `Ctrl+C` to stop both local services.

## Local development mock

Create an untracked `.env` file:

```dotenv
PUBLIC_ADMIN_MOCK=true
```

Then run `npm run dev` and open `/Wilderness-Odyssey/admin/`. Any non-empty username and password open the mock console. Mock records are stored in browser `localStorage`; mock uploads use local data URLs for preview. Every mock screen and save result says that no commit or deployment was created.

`PUBLIC_ADMIN_MOCK` is guarded by `import.meta.env.DEV`, so setting it during a production build cannot activate mock authentication. Clear the browser key `wo-admin-mock-v1` to reset mock records.

## Optional remote API configuration

Set the GitHub Actions repository variable `ADMIN_API_BASE` to the HTTPS origin of the deployed Admin API. The Pages workflow exposes it to Astro as `PUBLIC_ADMIN_API_BASE` while building. This value is public configuration, not a secret.

Do not place any of these values in `PUBLIC_*` variables, `.env`, Astro source, or generated HTML:

- GitHub personal access tokens or App private keys;
- passwords or password hashes;
- session signing keys;
- storage credentials;
- webhook secrets.

The API should allow the exact Pages origin, use HTTPS, and support credentialed requests. Local development origins may be allowed separately.

## Authentication boundary

The recommended production implementation uses a server-created session in a `Secure`, `HttpOnly`, `SameSite` cookie. After login, the API returns only safe operator display information and a CSRF token. The client sends that CSRF token in `X-CSRF-Token` for mutations. The API must still verify origin, session, authorization, and CSRF on every write.

Minimum expectations:

- rate-limit login attempts and return generic authentication errors;
- use a modern password hash or an external identity provider;
- rotate the session identifier at login and invalidate it at logout;
- keep a short idle timeout and a bounded absolute lifetime;
- audit operator, action, slug, commit, and result without logging secrets;
- validate request bodies and files again on the server;
- never accept a repository path supplied directly by the browser;
- scope the GitHub App or token to this repository and the smallest necessary permissions.

## HTTP API

All successful JSON responses may be returned directly or wrapped as `{ "data": ... }`. Errors should use `{ "code": "STABLE_CODE", "message": "Safe operator-facing message" }` with an appropriate status code.

### Session endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/session` | Return `{ authenticated, user?, csrfToken? }` |
| `POST` | `/api/admin/login` | Accept `{ username, password }`, create a server session |
| `POST` | `/api/admin/logout` | Revoke the current session |

### Transmission endpoints

| Method | Path | Purpose |
| --- | --- | --- |
| `GET` | `/api/admin/transmissions` | Return transmission summaries, including drafts |
| `GET` | `/api/admin/transmissions/:id` | Return one complete editable record |
| `POST` | `/api/admin/transmissions` | Validate and create a record |
| `PUT` | `/api/admin/transmissions/:id` | Validate and replace a record; supports a controlled slug rename |
| `DELETE` | `/api/admin/transmissions/:id` | Remove a record under the backend recovery policy |

Mutation responses use:

```json
{
  "transmission": { "id": "example", "slug": "example", "bodyMarkdown": "..." },
  "publishing": {
    "state": "commit-created",
    "message": "Website commit created.",
    "operationId": "publish_123",
    "commitUrl": "https://github.com/..."
  }
}
```

The complete TypeScript shapes live in `src/lib/admin/types.ts`. The backend must enforce the Astro schema in `src/content.config.ts`, the known transmission types, unique lowercase slugs, known roadmap IDs, site-root image paths, date formats, and useful gallery alt text.

### Media endpoint

`POST /api/admin/media` accepts authenticated `multipart/form-data` fields:

- `file`: image binary;
- `slug`: validated transmission slug;
- `purpose`: `cover`, `body`, or `gallery`.

Phase 1 accepts WebP, AVIF, PNG, JPEG, and GIF files up to 12 MB in the UI. The server must inspect actual bytes, reject mismatched or dangerous content, enforce its own smaller production limits if desired, strip unsafe metadata, and generate collision-safe names under:

```text
public/images/transmissions/<slug>/
```

Return `{ src, previewUrl, fileName, mimeType, kind }`. `src` is the permanent site-root path saved in Markdown. `previewUrl` may be a short-lived authenticated object URL or equivalent preview URL. The backend, not the browser, owns the final repository path.

Video/document attachments are intentionally postponed until their storage, transcoding, download, and public rendering rules are designed.

### Publishing status

`GET /api/admin/publishing/:operationId` returns:

```json
{
  "state": "build-running",
  "message": "GitHub Pages checks are running.",
  "operationId": "publish_123",
  "commitUrl": "https://github.com/...",
  "deploymentUrl": "https://thunderrock424242.github.io/Wilderness-Odyssey/..."
}
```

Supported states are `idle`, `saving`, `local-saved`, `commit-created`, `build-running`, `deploying`, `published`, `mock-saved`, and `failed`. The service must derive published states from real repository/workflow evidence. Never report `published` before the deployment succeeds.

## Recommended repository workflow

The server-side publishing adapter should:

1. fetch the current `website` branch head;
2. validate the complete transmission and uploaded assets;
3. serialize deterministic frontmatter and Markdown;
4. write `src/content/transmissions/<slug>.md` and approved media paths;
5. create one auditable commit, or a short-lived branch and pull request if review is required;
6. trigger or observe `.github/workflows/deploy-site.yml`;
7. expose the real check/deployment state through the publishing endpoint;
8. surface conflicts instead of force-pushing over newer work.

Use a GitHub App installation token where practical. Protect `website`, require the existing verification job, and preserve a commit-based recovery path for deletions and slug renames.

## Editor and output behavior

- Visual editing is powered by TipTap and round-trips through Markdown.
- Markdown previews are sanitized before insertion into the page.
- Body images retain their permanent `/images/...` source while local or temporary preview URLs remain editor-only.
- “Copy Markdown” produces a complete file matching the current content schema.
- Gallery fields render below the article body on the public transmission page and open in a keyboard-accessible dialog.
- Drafts remain excluded by the existing public collection filters.

## Verification

Run:

```bash
npm run verify
```

This checks Astro and content types, admin helper tests, all existing tests, the production build, required routes (including `/admin/`), base-aware links, assets, and draft exclusion. Also test the real local workspace at desktop and mobile widths before changing editor behavior. The browser mock remains useful for isolated UI work.

## Phase 2 candidates

- optionally deploy a remote Admin API and choose its identity provider;
- connect a GitHub App and protected-branch policy;
- add revision history, diff review, scheduled publication, autosave, and collaborative locking;
- implement responsive image processing and optional video/document assets;
- add server-side image malware/content inspection and retention cleanup;
- send publishing notifications only after verified workflow results;
- add end-to-end tests against a disposable repository and API environment.
