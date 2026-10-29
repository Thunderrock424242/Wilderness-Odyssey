# Edit website deployment settings

Open [`config/deployment.jsonc`](../config/deployment.jsonc). It is the editable source for non-secret website deployment settings, with comments next to every value. Keep IDs and other values inside double quotes. Comments and trailing commas are supported.

## Publish the public website first

The file is set up for `https://wilderness-odyssey.pages.dev`, project `wilderness-odyssey`, with `STAFF_AUTH_MODE` set to `disabled`. For a production deployment in this mode, only `SITE_URL` and `CLOUDFLARE_PAGES_PROJECT` are required. Leave `ACCESS_TEAM_DOMAIN`, `ACCESS_AUDIENCE`, `PUBLIC_STATUS_URL`, and `KINETIC_ADMIN_ORIGIN` blank until you need those integrations.

Run `npm run config:check -- --environment production`. Staff pages, login, and staff/authentication APIs return an uncached setup response; existing backend credentials cannot enable them while disabled. The status page explains that live data has not been connected. You can optionally set a valid `PUBLIC_STATUS_URL` to enable status reads without enabling staff access.

**An explicit `STAFF_AUTH_MODE=disabled` in the file wins over GitHub's staff-mode variable.** Old `discord` or `access` variables cannot accidentally re-enable staff or require the connected backend settings. To enable staff later, first change the selected mode in the file. Other nonempty environment overrides still apply. The GitHub `CLOUDFLARE_ACCOUNT_ID` and `CLOUDFLARE_API_TOKEN` deployment secrets and the normal deployment enablement/approval gates remain required; these publish the website and are independent of the optional bot/backend secrets.

The helper adds the canonical website hostname and production Pages hostname to the production allowlist. Other exact public hosts can be listed in `ALLOWED_HOSTS`. Generated revision/branch aliases remain inaccessible; the verifier checks their denial without needing preview service credentials for a public-only production release. The production revision and public pages are still verified on the public origins.

Preview deployments remain protected. Serving a preview still requires its Access team, audience, host allowlist, verifier identity, and verifier credentials, even when staff sign-in is disabled. Until configured, its middleware denies requests instead of serving a public preview.

To enable the dashboard later, explicitly select `discord` or `access`, complete that mode's settings and backend/runtime secrets, and validate in staging. Missing configuration never automatically enables staff access or switches authentication modes.

## Fix the Discord guild ID error

1. In Discord, enable **User Settings → Advanced → Developer Mode**.
2. Right-click your server and choose **Copy Server ID**.
3. Paste the ID into `shared.DISCORD_GUILD_ID`, keeping the quotes. It must match the backend's `GUILD_ID`; it is a server ID, not your account, channel, or application ID.
4. If enabling Discord staff access, fill in the other connected-mode settings using the comments in the file. This ID is not required for public-only disabled mode.
5. Check the configuration:

   ```sh
   npm run config:check -- --environment production
   npm run config:check -- --environment preview
   ```

The check reports all missing or invalid effective settings together, without requiring a build, modifying Wrangler, or contacting any service. A successful check validates settings only; it cannot prove that Discord, Cloudflare policies, runtime secrets, or backend services are configured correctly. Unknown real values are deliberately left empty in the checked-in file.

Commit and push the file through the normal review and protected deployment process to use your changes in CI. Editing a local copy does not update an already deployed site.

## Which section to edit

- `shared`: values used by both environments, such as the canonical website URL, Pages project name, authentication mode, and Discord server ID.
- `production`: live callback URL, staff hostnames, Access settings, and backend/status endpoints.
- `preview`: staging callback URL, hostnames, Access settings, backend/status endpoints, and preview verification identity. Use staging services and synthetic data.

Any recognized setting can be placed in an environment section to override its shared value. For example, add `DISCORD_GUILD_ID` inside `preview` to use a separate staging Discord server. The checked-in comments list the supported settings; misspelled or unknown names are rejected.

The order of precedence is:

1. `shared` values.
2. Selected `production` or `preview` values, including explicit empty strings.
3. Nonempty environment variables, including existing GitHub repository/environment variables.

**Existing GitHub variables win over the file, except when the selected file mode explicitly disables staff access.** That disabled mode cannot be overridden to enable staff through the environment. A `production` or `preview` section can deliberately select a connected mode instead of the shared disabled default. Remove other GitHub variables if you want to manage their values only in the file. Empty or whitespace-only environment variables do not erase file values. If you keep a `SITE_URL` override, its build/repository value and deployment/environment value must agree; deployment rejects an artifact built for another origin.

Builds default to `production`; `DEPLOY_ENVIRONMENT=preview` selects the preview section. CI selects preview settings for `preview/**` pushes. A blank `SITE_URL` keeps the existing `http://localhost:4321` build fallback, but deployment validation requires an approved HTTPS origin.

## What stays outside this file

Keep these GitHub controls and secrets in their existing locations:

- `ENABLE_PAGES_DEPLOYMENTS`, protected environments, and required reviewers remain deployment gates.
- GitHub environment secrets: `CLOUDFLARE_ACCOUNT_ID`, `CLOUDFLARE_API_TOKEN`, `PREVIEW_ACCESS_CLIENT_ID`, and `PREVIEW_ACCESS_CLIENT_SECRET`.
- Cloudflare Pages runtime secrets: `KINETIC_ACCESS_CLIENT_ID`, `KINETIC_ACCESS_CLIENT_SECRET`, and `CSRF_SECRET`.
- Discord bot/application secrets and private backend configuration stay on the backend host.

`PREVIEW_VERIFY_SERVICE_ID` is the verifier's signed identity, not its credential. Backend origins in this file are non-secret deployment metadata and are not copied into browser bundles. Never put an authentication token in a URL.

`wrangler.jsonc` remains the intentionally unconfigured local-development template. The deployment helper validates the editable settings and tested artifact, then fills only the selected Wrangler environment. Avoid manually maintaining deployment values there. The build and verifier use the same configuration loader, which requires only Node's built-in modules.

See [Cloudflare deployment](cloudflare-deployment.md) for protection, runtime bindings, verification, and rollback, and [Discord sign-in](discord-admin-auth.md) for the backend contract.
