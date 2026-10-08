# Hosted administrator setup

The website now has administrator interfaces at `/admin/content/`, `/admin/content/pages/`, and `/admin/settings/`. The separate `bot` backend owns drafts, images, authorization, encrypted credentials, and publication jobs. Installing the website alone does not enable these services.

After the one-time host setup, sign in with Discord to edit transmissions, site information, roadmap records, gallery captions, approved service connections, and scoped credentials. Maintenance, AI pause, model selection, and inference controls remain in the existing dashboard.

## 1. Keep bootstrap configuration on the trusted hosts

Use separate preview and production databases, encryption keys, Access identities, callbacks, and GitHub installations or repository boundaries. Never put the following backend secrets in Astro `PUBLIC_*` variables, content files, Git, or browser storage.

On the **bot backend**, keep its existing `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, `DATABASE_PATH`, and connected-service settings. Add:

```dotenv
CONNECTED_SERVICES_ENABLED=true
CONNECTED_ADMIN_ENABLED=true
CONNECTED_ENVIRONMENT=preview
DASHBOARD_AUTH_MODE=discord
DISCORD_CLIENT_SECRET=
DASHBOARD_REDIRECT_URIS=https://YOUR-STAGING-HOST/api/auth/discord/callback
DASHBOARD_MAIN_ORIGINS=https://YOUR-APPROVED-MAIN-GATEWAY
DASHBOARD_ENCRYPTION_KEY=
ACCESS_TEAM_DOMAIN=https://YOUR-TEAM.cloudflareaccess.com
BACKEND_ACCESS_AUDIENCE=
GATEWAY_SERVICE_ID=
```

`CLIENT_ID` is the Discord application ID. `DISCORD_CLIENT_ID` is an optional explicit override. Register the exact callback in the Discord Developer Portal. The bot must belong to `GUILD_ID` and be able to read guild members and roles. The backend checks current membership and Administrator permission through Discord on every website request; failed checks deny access. Its confidential OAuth flow uses an authenticated code exchange plus independent, single-use state and browser flow binding. See [Discord's authorization-code documentation](https://discord.com/developers/docs/topics/oauth2#authorization-code-grant).

Generate the encryption key locally on the backend host:

```powershell
node -e "process.stdout.write(require('node:crypto').randomBytes(32).toString('base64'))"
```

Store the output privately as `DASHBOARD_ENCRYPTION_KEY`. It encrypts managed read/write credentials with AES-256-GCM and binds them to their environment and scope. Preserve this key separately from database backups. Missing or incorrect keys do not erase credentials; affected connections become unavailable.

On **Cloudflare Pages**, configure existing runtime machine secrets `KINETIC_ACCESS_CLIENT_ID`, `KINETIC_ACCESS_CLIENT_SECRET`, and `CSRF_SECRET`, plus these non-secret runtime values:

| Variable | Value |
| --- | --- |
| `STAFF_AUTH_MODE` | `discord` |
| `DISCORD_GUILD_ID` | Same as backend `GUILD_ID` |
| `DISCORD_REDIRECT_URI` | Exact same-origin registered callback |
| `KINETIC_ADMIN_ORIGIN` | Trusted HTTPS backend origin |
| `ENVIRONMENT` | Matching backend environment |
| `ALLOWED_HOSTS` | Approved staff hostname |

Keep the backend behind the existing machine Cloudflare Access application. It verifies the signed machine JWT, issuer, audience, service identity, expiry, and environment separately from the human session. Human Access mode remains an explicit legacy option, with fresh credential replacement disabled in that mode. Discord failures never fall back to Access mode.

The website `.env` is only local/build configuration. Local content editing still works with `npm run admin`. Live setup belongs in Pages runtime settings and the backend's private environment; ordinary website edits will not require opening either environment file.

## 2. Initialize once and preserve the existing database

Use Node 22.13.1 or later. Stop the backend before operator changes. For a genuinely new installation only:

```powershell
npm ci
npm run dashboard:operator -- initialize --database data/wilderness-oddesy.sqlite
```

The command refuses an existing path. For an existing installation, retain the database and verify/backup it using the existing operator:

```powershell
npm run connected:operator -- verify --database data/wilderness-oddesy.sqlite
npm run connected:operator -- backup --database data/wilderness-oddesy.sqlite --output backups/before-hosted-admin.sqlite
```

Choose a new backup destination each time. Backup includes private drafts, images, encrypted credentials, sessions, and jobs. Restore a tested backup to a separate staging path and verify it before replacing an active database. Never initialize over a missing production database during reinstall.

## 3. Import current public source content

From the website checkout on the deployed `website` revision:

```powershell
npx tsx scripts/export-content-snapshot.ts --output content-snapshot.json
```

Transfer this public source snapshot to the backend host through your normal trusted file-transfer process. On the stopped backend:

```powershell
npm run dashboard:operator -- import-content --database data/wilderness-oddesy.sqlite --input content-snapshot.json
```

The import validates schemas and adds missing records. It preserves existing private drafts. `src/data/editable/site.json`, `roadmap.json`, and `gallery.json` are the website's editable source; their existing module interfaces and all original values are preserved. Draft saves go only to private SQLite storage and never enter a website build.

Existing host connection credentials can remain bootstrap values. To deliberately move them into encrypted managed storage:

```powershell
npm run dashboard:operator -- import-credentials --database data/wilderness-oddesy.sqlite
```

This reads the existing private host environment, prints no credential values, and refuses to overwrite managed credentials. Verify imported credentials from the dashboard.

## 4. Enable your administrator account

Review the new `/dashboard` command and register the bot command changes through your normal deployment process. Command registration is an external operation; this implementation has not registered live commands.

In the configured Discord server, run `/dashboard enable`, then visit `/login/` and sign in. Only the guild owner or a member with current Administrator permission can enroll. `/dashboard disable` revokes your enrollment and all sessions. Sessions last fifteen minutes; credential replacement requires a sign-in within the last five minutes.

If the editor returns unavailable, first check backend availability and machine Access configuration. A missing content record usually means its initial source import has not run. A denied session requires current Discord permissions and active enrollment. Do not bypass these states with mock mode in a hosted build.

## 5. Save settings, verify, and apply

Use `/admin/settings/` for the main-server HTTPS origin, monitoring intervals/thresholds, notification channels, and independent read/write credential replacement. Origins must be explicitly approved by `DASHBOARD_MAIN_ORIGINS`; network connections resolve and pin a public address and reject redirects, private addresses, and mixed DNS results. Channel IDs must identify sendable channels in the configured guild.

Saved managed settings take precedence over initial settings. The running monitoring and operation owners keep their current configuration until the backend is restarted through its normal operator process. The dashboard reports **restart required** until the new revision is loaded. It does not restart Minecraft or deploy the website. Connection changes wait for pending operations; accepted operations carry a destination identity and cannot be sent to a different server after restart.

**Verify saved connection** checks `/v1/service/health` with the read credential and requires the configured `MAIN_SERVER_ID`. It never executes a privileged operation to test a write token. A peer can enable safe write verification by supplying this read-only endpoint:

```text
GET /v1/service/credential-scope
Authorization: Bearer <write credential>
200 application/json
{ "schema_version": "1.0", "server_id": "YOUR_MAIN_SERVER_ID", "scope": "write", "read_only_check": true }
```

Until the peer supports that exact scope check, managed write credentials remain unverified and cannot enable dispatch after restart. A successful read check alone does not verify writes. Existing bootstrap write controls retain their prior policy until credentials are explicitly imported/replaced. Coordinate issuance/rotation on the peer independently; saving a token here cannot create or revoke a peer credential.

## 6. Optional reviewed content publication

Private drafts and editing work without GitHub publication. To publish from the dashboard, install a GitHub App only on the intended repository. Grant Contents and Pull requests write, Actions and Deployments read. Keep repository protections and owner deployment approvals. Set these backend-only values:

```dotenv
CONTENT_GITHUB_APP_ID=
CONTENT_GITHUB_INSTALLATION_ID=
CONTENT_GITHUB_REPOSITORY_ID=
CONTENT_GITHUB_REPOSITORY=OWNER/REPOSITORY
CONTENT_GITHUB_PRIVATE_KEY=
CONTENT_DEPLOYMENT_ORIGIN=https://YOUR-PUBLIC-HOST
```

The key can contain literal `\n` escapes in a private environment file. Installation tokens are short-lived, restricted to the selected numeric repository ID and requested permissions; see [GitHub installation authentication](https://docs.github.com/en/apps/creating-github-apps/authenticating-with-a-github-app/authenticating-as-a-github-app-installation).

Request publication only after acknowledging that its source and images will be public in the pull request. The job freezes that saved revision, uses a dedicated `codex/content-...` branch against `website`, and writes only approved transmission/data/image paths. It cannot change workflows or arbitrary files. Review and merge through the existing repository process. Closing a pull request stops its job; revoked authority stops unsent work. A merge or successful check is not publication confirmation. The backend requires the merged SHA's successful `deploy-site.yml` push run and matching public `/revision.json` commit and origin before reporting **published**.

Publication errors never discard a private draft. Source conflicts require reviewing the latest public source and reconciling the draft; do not repeatedly submit over newer changes. Concurrent publication of the same record is rejected.

To recover after another tool changes the same public record, export a fresh public snapshot from the latest `website` revision. Finish or close that record's existing pull request and let its backend job reconcile first. Back up the database, stop the backend, and import the snapshot to add any new referenced records. Then export the affected private draft on the trusted host:

```powershell
npm run dashboard:operator -- export-draft --database data/wilderness-oddesy.sqlite --kind transmission --id YOUR-SLUG --output private-reviewed-draft.json
```

For structured content, use `--kind site --id site`, `--kind roadmap --id roadmap`, or `--kind gallery --id gallery`. The output contains private content and must stay on the trusted host, outside Git and public assets. It refuses an existing output file. Review the latest public record and merge your intended changes into the exported file's `data` field. Preserve its ID, revision, and source-revision fields. Apply that reviewed merge explicitly:

```powershell
npm run dashboard:operator -- reconcile-content --database data/wilderness-oddesy.sqlite --input latest-public-snapshot.json --draft private-reviewed-draft.json --acknowledge-source-change
```

This checks the exported private revision, rejects active publication jobs, validates the merged fields/assets/references, and advances the public base without requesting publication. A stale export fails instead of overwriting another edit. Restart the backend, refresh the website editor, review the saved result, and request publication normally.

Unsent requests require a still-valid login immediately before each repository mutation, including after GitHub token refresh. Logout, expiry, and affirmative revocation cancel unsent work; a permission-service outage retries it. Already-submitted pull requests continue read-only merge/deployment tracking after requester logout or revocation. Matching workflow protection rules produce a separate **awaiting approval** state using [GitHub's pending-deployment API](https://docs.github.com/en/rest/actions/workflow-runs#get-pending-deployments-for-a-workflow-run); the dashboard never approves those rules itself.

## 7. Staging acceptance before production

Run website `npm run verify` and `npm run test:e2e`; run backend `npm run check`, `npm test`, and `npm run build`. Automated tests use synthetic Discord, GitHub, and main-server responses. They do not establish live hosting or provider readiness.

In staging, prove enrollment/login/logout, role removal during an upload, credential replacement after fresh sign-in, expected-server checks, restart/application state, backup restoration, a reviewed publication, protected deployment approval, and the exact deployed revision. Then use the existing production deployment gates. No production settings, DNS, live commands, GitHub App installations, source publication, or deployment were changed by the local implementation.
