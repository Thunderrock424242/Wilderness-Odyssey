# Discord dashboard sign-in

The website side is implemented. Live sign-in requires the bot backend's matching endpoints. Until connected, staff requests fail closed. The website does not enroll administrators or decide Discord permissions.

Users run `/dashboard enable` in the Wilderness Odyssey server. The bot verifies the caller's Administrator permission, registers that caller for that server, and privately returns the website's `/login/` link. `/dashboard disable` revokes enrollment and sessions. These commands belong to the bot and are not implemented here.

## Configuration

Configure each approved Pages environment separately:

| Setting | Value |
| --- | --- |
| `STAFF_AUTH_MODE` | `discord` |
| `DISCORD_GUILD_ID` | The backend's authorized `GUILD_ID` |
| `DISCORD_REDIRECT_URI` | `https://YOUR-APPROVED-HOST/api/auth/discord/callback` |
| `ENVIRONMENT`, `ALLOWED_HOSTS` | Existing environment and staff hostname allowlist |
| `KINETIC_ADMIN_ORIGIN` | Existing trusted HTTPS backend origin |
| `KINETIC_ACCESS_CLIENT_ID`, `KINETIC_ACCESS_CLIENT_SECRET` | Existing runtime-only machine Access credentials |
| `CSRF_SECRET` | Environment-specific random secret of at least 32 bytes |

Login must run on the callback's own origin. Production deployment preparation requires that origin to match `SITE_URL`. Other approved public production hosts, including the `pages.dev` hostname, deny staff access with 403 and never use a different callback. Preview uses an approved staging callback and backend; existing preview Access protection remains, and preview smoke-check service identities cannot use login or staff routes.

Discord application credentials stay on Kinetic. Register the exact callback in the Developer Portal. Never put the client secret, bot token, OAuth codes or session tokens in public configuration, logs or browser storage.

Explicit `STAFF_AUTH_MODE=access` preserves the previous human Access flow for a coordinated transition. Missing configuration or Discord failure never automatically selects it. Keep production Access protection until staging proves the replacement; changing that protection requires separate approval.

## Backend contract

The authoritative schemas are `contracts/v1/auth.ts`. `npm run contracts:export` exports them under `discordAuthentication` in `contracts/v1/schemas.json`.

Every request uses the existing gateway machine Access credentials, `X-WO-Environment`, and `X-Request-Id`. Kinetic independently verifies its signed machine Access assertion, exact service identity, audience, issuer, expiry and environment.

| Kinetic endpoint | Input | Response |
| --- | --- | --- |
| `POST /v1/admin/auth/discord/start` | `{ redirectUri }` | `{ schemaVersion: '1.0', authorizationUrl, flowToken, expiresAt }` |
| `POST /v1/admin/auth/discord/callback` | `{ redirectUri, code, state, flowToken }` | `{ schemaVersion: '1.0', sessionToken, userId, guildId, expiresAt }` |
| `GET /v1/admin/session` | `X-WO-Admin-Session` | Existing session plus `{ guildId, expiresAt }` |
| `POST /v1/admin/auth/logout` | `{}` and `X-WO-Admin-Session` | `{ schemaVersion: '1.0', revoked: true }` |
| Existing `/v1/admin/*` operations | Existing inputs and `X-WO-Admin-Session` | Existing outputs |

State, flow token and session token are independent random 32-byte values encoded as 43-character base64url strings without padding. Codes are bounded to 2,048 characters. Discord IDs are decimal snowflakes of 17–22 digits; timestamps are ISO 8601 with an offset or `Z`.

Authorization URLs use exactly `https://discord.com/oauth2/authorize`, `response_type=code`, `scope=identify`, the registered `redirect_uri`, application `client_id`, and state. Each field occurs once. Optional `prompt` can only be `consent`; other fields, scopes, credentials and fragments are rejected.

Attempts expire within five minutes and are atomically single-use. Sessions expire within fifteen minutes without sliding renewal. Session reads return the original expiry, the verified Discord user ID and role `administrator`; capabilities may be narrower than that role's existing ceiling. Kinetic checks active enrollment and current Administrator permission in the enrolled guild before every staff request and queued operation execution.

Use 401 for invalid/expired identity or attempts, 403 for denied access, 429 for rate limits and 503 for unavailable dependencies. Missing enrollment can return `403 { code: 'ENROLLMENT_REQUIRED' }`; the website displays bot-command instructions. Backend error text is never copied into the login page.

## Browser and deployment behavior

`GET /api/auth/discord/start` stores the flow binding in `__Host-wo-admin-flow` and redirects to Discord. The fixed callback brokers verification to Kinetic, clears the flow cookie and stores the session in `__Host-wo-admin-session`. Both cookies use Secure, HttpOnly, SameSite=Lax and Path=/ with no Domain attribute. Session credentials never appear in browser JSON. Caller-supplied identity headers cannot replace the cookie.

The browser session response adds `authMethod: 'discord'` and an origin- and session-bound CSRF token. Existing mutation reasons, revisions, capability checks and idempotency remain. Sign-out sends a CSRF-protected POST to `/api/auth/logout`. After CSRF validation, Pages clears this browser's cookie even if backend revocation fails; the UI explains unconfirmed revocation and directs users to `/dashboard disable`. Rejected cross-origin or CSRF requests cannot clear the cookie.

The login page explains enrollment and displays safe cancellation, expiry, denial, outage and logout messages. Staff HTML and authentication responses are not cached. Staff APIs return safe denials; staff page denials redirect to login. The local `/admin/content/` editor remains loopback-only and independent of Discord enrollment.

The workflow passes the three new non-secret settings to the configuration helper. Existing deployment enable and approval gates remain. No deployment or production policy change is included in the local work.

Run `npm run verify` and `npm run test:e2e`. Automated tests use synthetic backend responses; real Discord login, role removal, self-revocation and queued-operation checks require staging. Give the bot's Codex chat the [implementation message](discord-admin-bot-codex-message.md).
