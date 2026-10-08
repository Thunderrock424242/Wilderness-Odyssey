# Connected services and Aether administration

This implementation belongs to the `bot` branch. The public website and Java companion have separate checkouts and release steps. Everything is disabled for external use until configured; no production deployment, Access policy, role assignment, DNS change, or server restart is performed by this change.

## Identity and permissions

Every Aether generation entry point requires verified identity. Discord interactions provide a verified Discord user. Website/standalone users sign in through the separate account Access application, then create a 30-day personal API token. Only its SHA-256 hash is stored. Tokens do not require Minecraft membership. At most ten active tokens are allowed; revocation is immediate at the broker.

Official Minecraft requests require the companion's trusted server credential and an authenticated server-side player UUID. The gateway asks the bot's identity broker for current policy before generation. Client-submitted UUIDs are never proof of ownership. Bot and gateway credentials must remain on their trusted hosts, never in a distributed mod/client, website bundle, or public repository. Public account tokens cannot request official-server actions.

Official-server restrictions affect only authenticated traffic from the configured official server. Account restrictions apply across Discord, website/standalone tokens, and linked Minecraft identities. Linking merges existing restrictions; unlinking removes the visible/useful claim while retaining a minimal security association so restrictions cannot be erased. Existing legacy links require fresh server-attested linking to count as verified Aether identity ownership.

Administration requires an explicit `STAFF_AUTH_MODE`. In `discord` mode, the gateway's signed machine Access assertion protects Discord OAuth and all staff endpoints. Staff actions additionally require an opaque dashboard session, active self-enrollment and current Administrator permission in the configured guild. In `access` mode, the separately forwarded human Access assertion and current SQLite staff assignment retain the legacy behavior. Authentication failures never switch modes. See [Discord dashboard setup](discord-admin-auth.md).

Viewer can read status/models; Moderator can additionally read/write player moderation and private reports; Administrator can additionally change maintenance, approved models/settings, AI pause, and advertised service operations. Existing Discord moderation commands still require their explicit staff assignment; in Discord authentication mode they also recheck dashboard enrollment and current Administrator permission. A stale assignment cannot authorize a demoted member.

Account login uses `ACCOUNT_ACCESS_AUDIENCE`, without requiring any staff assignment. Cookie/CSRF handling belongs to the website gateway. The bot requires signed machine and human assertions and accepts no caller-supplied role headers. Preview and production need separate Access applications, audiences, service credentials, databases, and main gateways.

## HTTP contract

All responses use `Cache-Control: no-store`; no CORS access is granted directly by the bot. Expose only necessary routes through HTTPS and keep the underlying allocation private. The same existing support listener handles the following:

| Route | Caller and authority |
| --- | --- |
| `GET /health` | Minimal process liveness only; not a service readiness claim |
| `GET /api/public/v2/status` | Public, sanitized version 2 status |
| `GET /api/public/v1/status` or `/v1/public/status` | Existing website-compatible status projection |
| `/v1/admin/*` | Signed Access machine + staff assertions, explicit active role |
| `/v1/account/session`, `/tokens`, `/tokens/:id/revoke`, `/minecraft-link` | Signed Access machine + account assertions; own account only |
| `POST /v1/service/authenticate` | Dedicated identity broker bearer credential |
| `POST /v1/service/observations` | Dedicated main-server ingest bearer credential |
| `POST /v1/service/minecraft-link` | Ingest credential plus server-attested UUID/profile, one-time account code |
| `POST /api/minecraft/verify` | Existing Discord link-code payload, now requires ingest bearer credential |
| `POST /api/aether/bridge` | Existing separately scoped bridge secret and exact configured server identity |
| Configured metrics path | Dedicated metrics bearer credential |

Website v1 contracts were vendored from website commit `35e9e676c656aea618b97af91d0eac249981a709` into `src/contracts/v1`. Their existing names and response projections are preserved. Global account moderation adds `GET /accounts/:uuid`, `GET /players/:uuid/account`, `POST /accounts/:id/restrictions`, and `POST /accounts/:id/restrictions/:id/revoke` under the admin prefix. Keep matching schema changes synchronized with the website checkout.

The identity broker accepts exactly `{kind:"account_token",token}` or `{kind:"official_minecraft",server_id,minecraft_uuid,username?}`. It returns `account_id`, `minecraft_uuid`, `official_server_id`, `allowed`, `reason`, and `expires_at`. A submitted official UUID is accepted only from the trusted gateway holding the broker credential; the gateway must authenticate official-server traffic first. Broker failure denies new inference. Do not cache policy beyond `expires_at` (30 seconds).

The bot polls `GET /v1/service/health` and `/v1/service/capabilities` using the read credential. Operations use the separate write credential and a persisted operation ID: `POST /v1/service/operations`, then `GET /v1/service/operations/:id` for reconciliation. Allowed action IDs are `ai.pause`, `model.activate`, `inference.settings`, `inference.probe`, and `model.unload`, restricted further to the companion's advertised list. No shell, arbitrary command, model download, arbitrary URL, or unrestricted restart is exposed.

Writes require an `Idempotency-Key` of 16–100 letters, digits, hyphens, or underscores. Changed payload with a reused key is rejected. Local idempotency records last seven days. Operations persist before dispatch, expire after five minutes before acceptance, and recheck the current actor permission before sending. Ambiguous responses stay pending and are reconciled by their original ID. Success is reported only when the main server confirms it. Failed or stale revisions need a refreshed deliberate request.

Token issuance is deliberately one-time: retrying the same key returns `409 TOKEN_ALREADY_ISSUED`, because the plaintext credential is never persisted for replay. List/revoke the token and issue another if its response was lost.

## Monitoring and reports

Polling defaults to 30 seconds with a five-second timeout. Collector/network/authentication failure makes availability unknown; a refused status request is not proof that Minecraft or Ollama is offline. Individual component timestamps and collector sequence are validated, repeated samples do not count twice, and data becomes unknown after 120 seconds. Last verified component evidence survives unknown samples and restarts. Three missing component observations create a private staff monitoring warning; two confirmed observations resolve it. Missing measurements do not generate a public service-outage announcement. TPS/MSPT come only from actual server telemetry; missing values remain null. Performance degradation uses three completed 60-second windows below 15 TPS or above 80 MSPT, with two recovery windows above 18 TPS and below 55 MSPT.

Three failed observations confirm an incident and two healthy observations confirm recovery. Maintenance suppresses expected alerts while health checking continues. Maintenance and AI request pause are separate controls. Incidents and notification delivery state survive restarts. Discord deliveries have durable event markers and bounded retries; reconciliation examines the last 100 messages, so this is not a claim of exactly-once delivery after long outages or heavy channel traffic.

AI reports stay in the private backend and never enter public bug forums, GitHub, or public status JSON. Only user-selected excerpts are accepted: up to ten excerpts, 2,000 characters each, 12,000 total. Excerpts expire after 30 days and report/history/audit metadata after 180 days. Reading report content is audited. Appeals are separate records; accepting an appeal does not silently remove restrictions. Explicit revocation is independently audited. No background conversation scraping is added.

## Kinetic setup and rollout

Use Node 22.13.1 or newer. Node 22.5–22.12 require an experimental SQLite flag and are not supported by this package. The bot uses the bundled Node SQLite API; a separate database server is unnecessary.

1. Install locked dependencies, then run `npm run check`, `npm test`, and `npm run build`.
2. Preserve the configured `DATABASE_PATH` directory during every Kinetic reinstall. The host does not retain it automatically. Keep encrypted off-host backups; losing this database loses identities, restrictions, incident state, audit history, and token hashes.
3. Configure HTTPS/reverse proxy and protect the direct listener/allocation. Configure separate Cloudflare Access applications for staff, accounts, and backend machine traffic. Give the gateway the backend service-token credentials; the bot validates Access's signed machine assertion, not raw client-id headers.
4. Generate separate random credentials of at least 32 characters for main read, main write, ingest, identity broker, legacy Aether bridge, and metrics as needed. Configure exact official server identity on both sides.
5. Bootstrap explicit staff assignments using the local operator tool below, after verifying issuer/subject against the intended account. No staff assignment is automatically created.
6. Enable connected services and test staging first: login, token create/revoke, actual server-attested linking, global and official-only restrictions, model allowlist, pause, real inference, stale data, maintenance, lost operation responses, Discord outage/recovery, and backup restore.
7. Only after separate production approval, configure live secrets/access, publish the website, install the companion, register changed slash commands, and enable production flags. Actual host TLS, Access, Discord delivery, live Minecraft/Ollama inference, and reinstall behavior require staging/live evidence; local tests alone do not prove them.

## Local operator and backups

These commands are intentionally manual. Supply real values only on the trusted host:

```text
npm run connected:operator -- grant --database data/wilderness-oddesy.sqlite --issuer discord --subject DISCORD_USER_ID --role administrator --name Owner --operator HOST_OPERATOR
npm run connected:operator -- grant --database data/wilderness-oddesy.sqlite --issuer https://TEAM.cloudflareaccess.com --subject ACCESS_SUBJECT --role moderator --name Moderator --operator HOST_OPERATOR
npm run connected:operator -- revoke --database data/wilderness-oddesy.sqlite --issuer discord --subject DISCORD_USER_ID --operator HOST_OPERATOR
npm run connected:operator -- backup --database data/wilderness-oddesy.sqlite --output backups/wo-YYYYMMDD.sqlite
npm run connected:operator -- verify --database backups/wo-YYYYMMDD.sqlite
```

Backup uses SQLite `VACUUM INTO`, includes committed WAL data, refuses existing destinations, and checks integrity. Do not copy only the live `.sqlite` file while ignoring WAL. To restore, stop the bot, preserve the current database and its sidecars for rollback, verify the backup, restore to the configured path, then restart and verify roles/restrictions before allowing traffic. Never combine old WAL/SHM sidecars with a restored database. Apply a retention policy to backups too: old backups retain old excerpts even after live cleanup. Restrict OS access to database and backup files.

Public static website assets must never contain secrets, moderation records, or selected report content. The old branch-specific Pages workflow is not a bot deployment procedure.

Startup safeguard: when connected services are enabled, a missing or empty database stops startup instead of creating an unrestricted replacement. For the first installation only, start once with connected services disabled to initialize the database, then configure identities/roles before enabling it. Following any reinstall, restore the preserved database; do not turn off this protection to work around lost data. Keep Ollama bound to a trusted private interface so public clients cannot bypass the authenticated gateway.

Compatibility verification: the complete bot suite, compiler checks, and production build passed on local Node 22.13.1; current totals are recorded in `connected-services-progress.md`. This is the compatibility floor; use the host's current maintained Node 22 patch for deployment. The locked Undici dependency was patched to 6.28.1 and the production dependency audit reported zero vulnerabilities at verification time.

## Discord controls

`/status`, `/players`, and `/aether status` show measured service state; configured release labels remain recommendations. `/maintenance show|set` and `/modlog player|account|report` use the current explicit backend staff assignment in the configured guild. Denied staff requests are audited.

`/report bug` reuses guided support intake. `/report aether` requires a current verified Minecraft link and previews redacted, selected evidence before private confirmation. Ownership is checked again on submission. `/report appeal` records a private request for review. No report is persisted if the preview is cancelled or expires.

`/aether token issue` directs the user to the protected website account page. Credentials are never sent through Discord, including ephemeral messages. Token list and revoke operate only on the caller's account and expose metadata.

The vendored v1 contracts include the matching website account moderation routes. Their base remains website commit 35e9e67, with the approved connected-services additions synchronized from the isolated website checkout. Re-export contracts in the website project before synchronizing later changes.
