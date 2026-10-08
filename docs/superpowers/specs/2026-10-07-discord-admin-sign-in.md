# Discord sign-in for the staff dashboard

Status: website implementation complete locally; bot/backend implementation and live rollout remain separate. See `docs/discord-admin-auth.md` and `docs/discord-admin-bot-codex-message.md` for the implemented contract and bot handoff.

## Intended behavior

The user requested Discord sign-in for the administrative dashboard. They selected staff-only access, clarified that any role with Discord's Administrator permission should qualify, and specified that users enable their own dashboard administration through the Discord bot. The bot must verify Administrator permission in the server where the command runs before granting access. Discord sign-in alone does not enroll a dashboard administrator.

Admission requires both an active bot-created enrollment and current effective Administrator permission in that same authorized Discord server. It does not depend on a role name, a list of role IDs, or administration of another server. The server owner qualifies through Discord's effective permissions.

Successful sign-in grants the existing website Administrator capability ceiling. Existing operation allowlists, reasons, record checks, idempotency, audit history, and main-server authorization continue to apply. Discord login does not make additional server commands available or grant repository publishing access.

## Existing boundaries

The current checkout is the `website` branch and contains the static Astro site, Cloudflare Pages Functions, and administration gateway. The previous human authentication used Cloudflare Access assertions in `server/access.ts`, `functions/_middleware.ts`, and `server/gateway.ts`; it remains available only through explicit `STAFF_AUTH_MODE=access` configuration. The new Discord mode uses the gateway modules described in `docs/discord-admin-auth.md`.

The trusted Kinetic backend exists on the repository's separate `bot` branch. Its `src/connected/auth.ts` independently validates the gateway's machine Access identity and the website's human Access assertion. It then resolves an existing staff assignment. A Discord button alone would not change either authentication boundary.

## Recommended architecture

Use bot-mediated self-enrollment followed by Discord OAuth authorization-code login with trusted Kinetic session storage. Keep Cloudflare Access for gateway-to-Kinetic machine authentication and existing preview protection. Production staff human sign-in moves to Discord; it does not also require a separate human Cloudflare login.

This avoids introducing another identity-provider service. An OIDC broker could preserve the original human Access assertion contract, but would add another service and configuration owner. A frontend-only login cannot satisfy the backend authorization requirement.

### Bot self-enrollment

The proposed commands are `/dashboard enable` and `/dashboard disable`. They operate only on the authenticated caller; neither accepts a target user, permission level, or arbitrary server ID. They grant website dashboard access and do not add or modify Discord roles.

For enablement, reject direct messages and require the interaction's server ID to match the dashboard backend's authorized `GUILD_ID`. Fetch the caller's current membership and the server's current roles through the trusted bot client. Check effective `Administrator` permission, including server ownership. The existing broader `requireStaff` helper also accepts Manage Server and Moderate Members, so it must not be used as this command's authorization rule.

Only after a successful check, create or reactivate an enrollment bound to the verified Discord user ID and server ID in trusted backend storage. Repeated enablement is idempotent. Audit the actor, server, and outcome without recording credentials. Reply privately with the dashboard login link and a clear success or denial message. A lookup failure or bot/backend outage cannot create an enrollment.

Disablement lets the authenticated caller revoke their own enrollment and all associated browser sessions, even after losing Administrator permission. It never revokes someone else's enrollment. Registration and command visibility must allow this self-revocation path; runtime checks enforce Administrator permission specifically for enablement.

The enrollment is permission to use this deployment's dashboard for this server. Installing the bot in another Discord server and administering that server must not grant access to the Wilderness Odyssey dashboard.

### Login and session flow

1. A public `/login/` page displays an accessible **Sign in with Discord** link. Unauthenticated staff page navigation redirects there; staff APIs return a safe 401 response.
2. A narrowly scoped same-origin authentication gateway requests an OAuth attempt from Kinetic, using the existing machine Access credentials. Kinetic generates a random state and independent browser-binding nonce, persists only their hashes with a five-minute expiry, and returns a validated Discord authorization URL. Pages sets the nonce in a Secure, HttpOnly, SameSite=Lax, host-only cookie.
3. Discord returns an authorization code and state to a fixed, registered same-origin callback. Pages passes the code, state, and browser-binding nonce to Kinetic. Kinetic atomically consumes the attempt, verifies both bindings and expiry, and exchanges the code using a runtime-only Discord client secret.
4. Kinetic retrieves the authenticated Discord user, rejects bot identities, and requires an active self-enrollment for that user and its configured `GUILD_ID`. It checks the user's current membership and effective Administrator permission in the enrolled server. Use the existing trusted bot client to fetch current membership and roles; deny when any required Discord lookup fails. Request only the OAuth `identify` scope, since guild authorization uses the existing bot identity. An eligible administrator without enrollment is told to run `/dashboard enable` in the server first.
5. Kinetic issues a random 256-bit opaque session credential with a fifteen-minute absolute expiry. Persist its hash and Discord user ID. Pages places the credential in a `__Host-wo-admin-session` cookie with Secure, HttpOnly, SameSite=Lax and Path=/ attributes. Browser JSON responses contain only the existing safe session schema and CSRF token.
6. Every staff API request must pass the existing independent gateway machine check, the opaque session lookup, an active enrollment check, and a fresh Discord Administrator check at Kinetic for the enrolled server. Pages also verifies a session before serving staff pages. The browser cannot supply role decisions, enrollment decisions, or arbitrary upstream credentials.
7. Logout requires a same-origin CSRF-protected POST, revokes the backend session, and clears the browser cookie. Expiry requires a new Discord sign-in; no OAuth refresh token or access token is retained after identity verification.

Redirect destinations are restricted to known staff page paths. Authentication responses use `Cache-Control: no-store`. Codes, tokens, cookies, state values, and secrets are excluded from logs and error messages.

### Authorization and existing records

Use the verified Discord user ID as the staff session subject. Preserve existing staff assignments and moderation/audit records; never silently relabel historical Access subjects as Discord identities. The new session path is explicitly selected by configuration and does not fall back to anonymous access or the old login when Discord fails.

Backend authorization must derive the current administrator actor on each request and recheck it after asynchronous work. Pending privileged operations must also recheck enrollment, Discord membership and Administrator permission before execution. A stale database staff assignment cannot authorize an operation after self-revocation, removal of the role, or departure from the server. Confirmed loss of membership or Administrator permission deactivates the enrollment and revokes its sessions; restoration of the permission requires `/dashboard enable` again. Live permission lookup failure denies the action without reporting the member as definitively demoted or deleting the enrollment.

## Configuration and rollout

Use the bot's existing configured Wilderness Odyssey guild. Add runtime-only Discord application credentials, a fixed approved callback URL, and explicit session-auth configuration. Keep all credentials out of Astro public configuration and bundles. Unconfigured environments deny staff access with an understandable message.

The website and bot changes must ship compatibly. Preview continues to use its separate Access audience and staging credentials. Production Access policy changes are a separate reviewed rollout step; the existing edge protection remains until the replacement has passed staging validation. No deployment, DNS, or production authentication-policy change is authorized by this design.

The local `/admin/content/` repository editor remains a separate loopback-only tool with its existing publication gates. Hosted dashboard login does not expose it over the Internet.

## Verification

Add focused bot, website and backend tests for self-enrollment by the interaction caller, direct-message denial, wrong-server denial, repeated enablement, self-revocation after permission loss, refusal to enroll another user, and refusal to accept Manage Server or Moderate Members alone. Also cover OAuth state/nonce mismatch, attempt replay and expiry, malformed Discord data, an Administrator permission bit on any role, misleading role names without that bit, server ownership, missing enrollment, non-admin members, revoked enrollment/membership/roles, session expiry/logout, service identity denial, cross-origin requests, missing configuration, and stale queued-operation authorization.

Run each branch's existing checks, tests and build. For the website run `npm run verify` and production browser checks of login, authorized/unauthorized dashboard behavior, keyboard navigation, mobile layout, console output, and the Pages middleware. Real Discord login, role revocation, logout and backend operation checks require staging configuration and must be reported separately from local automated evidence.

## Reference

- [Discord OAuth2 authorization-code flow and state](https://docs.discord.com/developers/topics/oauth2)
- [Discord permission computation and Administrator permission](https://docs.discord.com/developers/topics/permissions)
- Existing website contracts and trust model: `docs/api-integration.md` and `docs/cloudflare-deployment.md`.
