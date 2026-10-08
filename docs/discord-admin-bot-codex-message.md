Implement the bot/backend side of Discord login for the Wilderness Odyssey admin dashboard. The website side is implemented. First inspect AGENTS.md and the current bot command registration, connected-services authentication, staff storage, administration routes, and queued-operation authorization. Reuse existing owners; preserve unrelated edits and existing records. Work on the bot checkout without overwriting the website changes.

Add `/dashboard enable` and `/dashboard disable`:

- Enable operates only on the caller in the interaction's guild. Fetch current membership and roles, and require actual Administrator permission or guild ownership. Manage Server and Moderate Members alone are insufficient; the existing broader `requireStaff` helper must not authorize this command.
- Bind enrollment to the verified caller ID and guild ID. Require the interaction guild to match this backend's configured `GUILD_ID`; administration of another server where the bot is installed cannot unlock this deployment. Reject DMs and arbitrary target-user/server parameters. Repeated enablement is idempotent.
- Privately confirm enablement with the website's `/login/` link. These commands grant dashboard access and do not change Discord roles.
- Disable revokes the caller's enrollment and all sessions, even after they lose Administrator permission. Command registration must allow that self-revocation path. Neither command can enroll or revoke someone else.

Use the website's exact schemas from `contracts/v1/auth.ts`, generated `contracts/v1/schemas.json` under `discordAuthentication`, and `docs/discord-admin-auth.md`. These website files currently live at `C:\Users\mason\IdeaProjects\Wilderness-Odyssey`; read them before changing checkout state or use a separate worktree. Do not assume uncommitted files can be read using `git show website:...`.

Implement these Kinetic endpoints:

| Endpoint | Input | Response |
| --- | --- | --- |
| `POST /v1/admin/auth/discord/start` | `{ redirectUri }` | `{ schemaVersion: '1.0', authorizationUrl, flowToken, expiresAt }` |
| `POST /v1/admin/auth/discord/callback` | `{ redirectUri, code, state, flowToken }` | `{ schemaVersion: '1.0', sessionToken, userId, guildId, expiresAt }` |
| `GET /v1/admin/session` | `X-WO-Admin-Session` header | Existing safe session response plus `guildId` and `expiresAt` |
| `POST /v1/admin/auth/logout` | `{}` plus `X-WO-Admin-Session` | `{ schemaVersion: '1.0', revoked: true }` |

All existing `/v1/admin/*` actions must also accept this session credential. Pages uses its existing machine Access credentials and sends `X-WO-Environment` and `X-Request-Id`. Cloudflare supplies the signed machine `Cf-Access-Jwt-Assertion` to Kinetic. Independently validate issuer, machine audience, exact configured service identity, expiry and environment. Do not require the old human `X-WO-User-Assertion` in Discord mode, and do not replace machine verification with trust in unsigned headers. Preserve legacy Access only behind explicit configuration, with no automatic fallback on failure.

Kinetic owns the OAuth code exchange, protected Discord client secret, enrollment and session storage. Allow only the exact approved environment callback URI. Generate independent random 32-byte state, browser-binding flow token and session token values, encoded as 43-character base64url strings without padding. Store only hashes. Expire OAuth attempts within five minutes and atomically consume them; verify state, flow token, callback binding and expiry before exchange. Bound the code to 2,048 characters.

Return authorization URLs using exactly `https://discord.com/oauth2/authorize`, `response_type=code`, `scope=identify`, registered `redirect_uri`, application `client_id`, and state. Optional `prompt` may be `consent`; the website rejects extra fields, duplicate fields and other scopes. Fetch the authenticated Discord user, reject bot accounts, require enrollment, and check current membership and Administrator permission using the trusted bot client. Discard OAuth access/refresh tokens after identity verification.

Issue a fifteen-minute absolute session. Return its original expiry, guild ID, verified Discord user ID, role `administrator` and capabilities within the existing Administrator ceiling. The website handles HttpOnly cookies and CSRF. Kinetic authorizes every action and record, retaining reasons, revisions, operation allowlists, idempotency and audits. Logout is idempotent and revokes the session even after permission loss.

Recheck enrollment, guild membership and Administrator permission on each staff request, after relevant asynchronous work, and before executing queued privileged operations. Confirmed permission/membership loss deactivates enrollment and revokes sessions; restoration requires `/dashboard enable` again. Discord outages deny access without deleting enrollment or falsely reporting demotion. Stale staff rows cannot authorize demoted users. Preserve historical Access identities and audits.

Use sanitized 401/403/429/503 errors. Missing enrollment returns `403 { code: 'ENROLLMENT_REQUIRED' }`. Rate-limit OAuth attempts, callbacks and staff requests. Never log tokens, codes, cookies, secrets or private conversations.

Test caller-only enrollment, Administrator on any role, ownership, wrong guild, DM denial, Manage Server/Moderate Members denial, repeated enablement, self-revocation after permission loss, OAuth bindings/expiry/replay, callback allowlists, bot identities, session expiry/revocation, Discord outages, machine identity/audience/environment denial, permission loss on existing sessions and queued operations. Validate producers against the website schemas and run the bot's existing checks, full tests and build.

Carry this through implementation and leave a reviewable diff. Report required runtime settings and callback setup. Do not deploy, register live commands, change Cloudflare policies or DNS, restart production, or claim real Discord integration passed without separate authorization and staging evidence.
