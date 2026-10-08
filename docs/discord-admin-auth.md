# Discord dashboard authentication on Kinetic

The bot implements caller-only `/dashboard enable` and `/dashboard disable`, the four website authentication/session endpoints, and session authorization for existing `/v1/admin/*` actions. No live commands were registered and no deployment or production policy change is part of this implementation.

## Required configuration

Set these environment variables on the backend before separately authorized staging:

| Setting | Purpose |
| --- | --- |
| `CONNECTED_SERVICES_ENABLED=true` | Enable the existing connected-service listener/routes |
| `CONNECTED_ADMIN_ENABLED=true` | Enable protected administration routes |
| `STAFF_AUTH_MODE=discord` | Select Discord sessions explicitly |
| `CONNECTED_ENVIRONMENT=production` or `preview` | Must match the Pages environment header |
| `GUILD_ID` | One configured Wilderness Odyssey server, 17–22 decimal digits |
| `CLIENT_ID` | Discord application ID belonging to the bot |
| `DISCORD_TOKEN` | Existing bot credential, kept only on Kinetic |
| `DISCORD_CLIENT_SECRET` | Discord application's OAuth secret, kept only on Kinetic |
| `DISCORD_REDIRECT_URI` | Exact approved HTTPS callback, e.g. `https://staff.example/api/auth/discord/callback` |
| `ACCESS_TEAM_DOMAIN` | Exact issuer, e.g. `https://TEAM.cloudflareaccess.com` |
| `BACKEND_ACCESS_AUDIENCE` | Backend machine Access application audience |
| `GATEWAY_SERVICE_ID` | Exact signed service `common_name` for Pages |
| `DATABASE_PATH` | Existing durable SQLite database; preserve it through reinstalls |

Configure preview and production independently with different databases, audiences and service identities. Only the single configured callback is accepted; paths, query strings, fragments, scheme changes and alternate hosts do not match. The backend derives the private `/login/` command link from this callback's origin.

Register that exact URI in the [Discord Developer Portal](https://discord.com/developers/applications), under the matching application's OAuth2 redirects. Discord specifies form-encoded authorization-code exchange and the `identify` scope for user identity; the implementation follows its [OAuth2 documentation](https://docs.discord.com/developers/topics/oauth2). The bot must belong to the configured guild and be able to fetch its guild, member and roles through its authenticated REST client. Administrator can come from any assigned role or guild ownership, consistent with [Discord's permission model](https://docs.discord.com/developers/topics/permissions). Manage Server and Moderate Members do not qualify.

On Pages, retain the existing machine Access runtime credentials and set `STAFF_AUTH_MODE=discord`, `DISCORD_GUILD_ID` equal to backend `GUILD_ID`, and `DISCORD_REDIRECT_URI` equal to the backend callback. Keep the existing `KINETIC_ADMIN_ORIGIN`, `ENVIRONMENT`, host allowlist and `CSRF_SECRET`. Pages owns host-only Secure/HttpOnly/SameSite=Lax cookies, CSRF and browser redirects. Public GitHub Pages assets must never receive credentials.

For an explicit legacy transition, select `STAFF_AUTH_MODE=access` and configure a distinct `WEBSITE_ACCESS_AUDIENCE`. OAuth/session routes are unavailable in that mode; signed human Access and historical staff assignments continue to authorize legacy requests. Account authentication retains its separate `ACCOUNT_ACCESS_AUDIENCE`.

## Endpoint and authorization contract

Every admin request must carry a signed `Cf-Access-Jwt-Assertion` from the configured machine service and the exact `X-WO-Environment`. Pages also forwards `X-Request-Id`. Machine issuer, audience, identity, issue time and expiry are verified independently; unsigned identity/role headers confer no authority. Discord mode does not require `X-WO-User-Assertion` and never falls back to it.

| Endpoint | Input/credential | Response |
| --- | --- | --- |
| `POST /v1/admin/auth/discord/start` | `{ redirectUri }` | `schemaVersion`, `authorizationUrl`, `flowToken`, `expiresAt` |
| `POST /v1/admin/auth/discord/callback` | `{ redirectUri, code, state, flowToken }` | `schemaVersion`, `sessionToken`, `userId`, `guildId`, `expiresAt` |
| `GET /v1/admin/session` | `X-WO-Admin-Session` | Safe user/capabilities plus original `guildId` and `expiresAt` |
| `POST /v1/admin/auth/logout` | `{}` and `X-WO-Admin-Session` | `{ schemaVersion: '1.0', revoked: true }` |
| Existing `/v1/admin/*` actions | Existing request and `X-WO-Admin-Session` | Existing validated response |

The schemas in `src/contracts/v1/auth.ts` match the website source contract. `test/fixtures/discord-auth-schemas.json` contains the website branch's generated `discordAuthentication` section from commit `d9ab1b91fabee427a3092c39cdf873dd39606720`; tests validate actual producers against it. Session capabilities stay within this bot's existing eight-capability Administrator ceiling. The website's additional authoring/configuration capabilities are not added by this authentication change.

State, browser-binding flow token and session token are independent random 32-byte base64url values. Only SHA-256 hashes enter durable storage or queued actor metadata. Attempts expire after five minutes and are atomically consumed before exchange. Sessions expire absolutely after fifteen minutes; reads never renew them. OAuth access and refresh tokens are discarded after identity verification, and bot accounts are denied.

`/dashboard enable` fetches current membership and permissions and enrolls only the verified caller in `GUILD_ID`. Repeated enable preserves existing sessions. `/dashboard disable` remains visible without an Administrator command restriction and revokes the caller's enrollment and every dashboard session without a permission lookup. Neither command changes Discord roles or accepts a target user or guild parameter. DMs and other guilds are rejected.

Protected actions recheck enrollment, session validity and current Discord Administrator permission, including after uploads/capability waits and immediately before queued dispatch. Confirmed membership/permission loss deactivates enrollment and revokes sessions. Restored permission requires `/dashboard enable` again. Discord outages deny access without deleting enrollment; undispatched operations back off within their existing expiry. Already dispatched operations continue service-only reconciliation so their audit remains accurate after logout; authorization is required again before any new dispatch. Historical staff rows and audits remain intact, and independent appeal review recognizes the same Discord human across old and dashboard identities.

Errors are sanitized; invalid credentials use 401, denial 403 (`ENROLLMENT_REQUIRED` when appropriate), throttling 429 and unavailable dependencies 503. The existing `{ error: { code, message } }` envelope is preserved. OAuth starts allow 20 per minute, callbacks 30 per minute per backend peer, and staff requests 120 per minute per session and verified actor; the shared existing peer limit remains. No forwarded browser IP is trusted for authorization or throttling. REST permission lookup has a five-second outer deadline in addition to transport cancellation. Existing request-body/response bounds, capability checks, reasons, revisions, allowlists, idempotency and private audits remain in force.

## Validation and staging

Run the existing repository scripts: `npm ci`, `npm run check`, `npm test`, `npm run build`. Automated tests use in-memory SQLite, fake Discord/remote responses, and synthetic signed machine assertions. They cover command registration payloads and handler replies without calling the live registration API.

Real Discord OAuth, command permissions/visibility, owner/admin role changes, membership removal, outage recovery, queued remote effects, Pages cookies and callback setup require separately authorized staging. Do not run `npm run deploy`, alter Cloudflare policies/DNS, restart production or deploy the backend as part of this local verification.
