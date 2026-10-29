# Edit website deployment settings

Open [`config/deployment.jsonc`](../config/deployment.jsonc). It is the editable source for non-secret website deployment settings, with comments next to every value. Keep IDs and other values inside double quotes. Comments and trailing commas are supported.

## Fix the Discord guild ID error

1. In Discord, enable **User Settings → Advanced → Developer Mode**.
2. Right-click your server and choose **Copy Server ID**.
3. Paste the ID into `shared.DISCORD_GUILD_ID`, keeping the quotes. It must match the backend's `GUILD_ID`; it is a server ID, not your account, channel, or application ID.
4. Fill in the other blank settings using the comments in the file.
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

**Existing GitHub variables win over the file.** Remove those variables if you want to manage their values only in the file. Empty or whitespace-only environment variables do not erase file values. If you keep a `SITE_URL` override, its build/repository value and deployment/environment value must agree; deployment rejects an artifact built for another origin.

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
