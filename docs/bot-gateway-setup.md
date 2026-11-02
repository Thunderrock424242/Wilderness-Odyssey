# Bot gateway Worker setup

The separate Worker at `workers/bot-gateway/` connects the website's Pages Functions to the Kinetic bot through Workers VPC. It is not part of the static website build. The owner approved local implementation on 2026-11-01; no deployment or Access policy is created by these commands.

## Local validation

```sh
npm run bot-gateway:types
npm run bot-gateway:check
npm test -- tests/botGateway.test.ts
npm run bot-gateway:build
npm run bot-gateway:smoke
npm run verify
npm run test:e2e
```

`bot-gateway:build` is explicitly a Wrangler **dry run**, not a deployment. It packages into ignored `.wrangler/bot-gateway-build/`. `bot-gateway:smoke` exercises that compiled module in Wrangler's bundled workerd simulator with a synthetic service binding; it contacts no live backend. `npm run check` includes the independent Worker type check; the normal website build and deployment workflow remain the Pages deployment owner.

The configuration binds `BOT_API` to existing service `01a1993c-5cfc-7310-a7b6-6b4677160389` (`wilderness-odyssey-bot-api`). All forwarded requests target `http://127.0.0.1:25599` inside the Kinetic container through that binding. No request can select a destination or trigger a generic proxy. Plain HTTP is used only for the final loopback hop.

## Routes and trust

### Initial live deployment, 2026-11-01

- Origin: `https://wilderness-odyssey-bot-gateway.thunderrock-labs.workers.dev`
- Version: `907748d0-14f9-42d9-8686-a1721774e156`
- Configured compatibility date `2026-11-01` accepted by Cloudflare.
- Read-only live verification: `/v1/public/status` returned 200 with schema `1.0` and unknown Minecraft/Aether state, confirming VPC/tunnel connectivity to the bot. `/v1/admin/session` returned uncached 503 `NOT_CONFIGURED`; unapproved service routes returned 404.
- Backend audience and service identity remain empty. No Access application/service token was created by this deployment, and no bot administrative mutation was executed.
- Local Pages deployment settings now contain this backend origin and status URL; those local edits do not update the deployed website. Its configuration check still requires the separate Pages `ACCESS_AUDIENCE`.

### Machine trust configured, 2026-11-01

- Access application `f45d11b8-9d83-41e0-8d09-1c375a852959` protects the exact gateway `/v1/admin/*` destination. Reusable policy `189e7890-f6ed-44d1-94e6-c1241e30afac` uses Service Auth and includes only the owner's Wilderness Odyssey service token.
- Gateway version `26d32a1d-b4d1-4748-8e1c-e1e07992cdd3` configures backend audience `83dc71c849a21c99edd9ee2eb2d976db49fe7815cd7e3dc533859b850a48bf41` and service identity `5da7e533c6f6ce6f27c2c29629920928.access`.
- Confirmed production Pages secret names `KINETIC_ACCESS_CLIENT_ID` and `KINETIC_ACCESS_CLIENT_SECRET` are present and encrypted. Created an independent random `CSRF_SECRET` directly through stdin; no secret values were read or stored in the repository.
- Fresh validation: gateway type check and 33 gateway tests passed; live anonymous public status returned 200 and admin session returned 403 after deployment.
- Outstanding: matching bot trust/OAuth configuration, Pages-specific Access audience/protection, approved website deployment, and authenticated end-to-end acceptance. Credential presence alone does not prove successful machine authentication.

- `GET /v1/public/status`: no caller credentials forwarded. Response is limited to 64 KiB and projected through `publicStatusSchema`; private extra fields are removed. Successful status responses allow 15 seconds of caching and preserve the bot's observation timestamp.
- Approved `/v1/admin/*` method/path combinations: selected from the shared admin, authoring and playtest contracts plus the three Discord authentication routes and private image routes. Other endpoints, including service ingest, metrics, arbitrary model operations and direct playtest enrollment, are unavailable.
- Admin requests require a signed RS256 Cloudflare Access assertion with the exact team issuer, backend application audience, service `common_name`, valid timestamps, and matching `X-WO-Environment`. Empty configuration denies access. The signed assertion and opaque session are passed to the bot, which independently verifies machine trust, enrollment, current Discord Administrator permission and action/resource authorization.
- This gateway is for **Discord staff mode**. It does not forward legacy human Access assertions. Switching authentication modes requires a separate reviewed change.
- Only allowlisted headers reach the bot. Service-token client credentials, browser cookies, Authorization, forwarded client IPs and arbitrary identity headers are removed. The gateway creates its own request ID.
- Request and response streams have byte limits and a 15-second deadline. Images are capped at 12 MiB. JSON mutation inputs and successful JSON outputs are checked against shared schemas. Redirects are never followed, errors are sanitized, and private responses are `no-store`.

Logs do not include submitted bodies, query fields, headers or tokens. Automatic invocation logs are disabled, and trace sampling is zero to avoid capturing private request URLs. Adjust telemetry only after reviewing what the provider records.

## Finish Cloudflare setup before enabling administration

1. Confirm tunnel `wilderness-odyssey-bot` is Healthy in Cloudflare and the bot HTTP API listens on port `25599`. The service's existence alone does not prove reachability.
2. Review and approve deployment of the Worker under name `wilderness-odyssey-bot-gateway`. Start with the checked-in empty `BACKEND_ACCESS_AUDIENCE` and `GATEWAY_SERVICE_ID`; administrative calls will be denied. Record the actual `workers.dev` hostname returned by Cloudflare. Do not guess it.
3. Create a dedicated Access self-hosted application protecting **that hostname's `/v1/admin/*` routes**, covering all Discord authentication routes as well. Leave only `/v1/public/status` public. Configure a Service Auth policy admitting only the production Pages service token. Use a reusable policy. Protect the hostname and ensure no alternate Worker URL bypasses the application; preview URLs are disabled in Wrangler.
4. Store the service token client ID/secret directly in the **Pages production runtime** as `KINETIC_ACCESS_CLIENT_ID` and `KINETIC_ACCESS_CLIENT_SECRET`. They do not belong in this Worker, source files, or chat. Store an independent `CSRF_SECRET` in Pages too.
5. Put the application's AUD and token's exact signed `common_name` in this Worker's non-secret `BACKEND_ACCESS_AUDIENCE` and `GATEWAY_SERVICE_ID`. Use matching `ACCESS_TEAM_DOMAIN`, `BACKEND_ACCESS_AUDIENCE`, `GATEWAY_SERVICE_ID`, and `CONNECTED_ENVIRONMENT=production` on the bot. Keep its existing session/permission checks enabled.
6. On Kinetic, verify `CONNECTED_SERVICES_ENABLED=true`, `CONNECTED_ADMIN_ENABLED=true`, `STAFF_AUTH_MODE=discord`, the existing Discord `CLIENT_ID` and `GUILD_ID`, private `DISCORD_CLIENT_SECRET`, and `DISCORD_REDIRECT_URI=https://wilderness-odyssey.pages.dev/api/auth/discord/callback`. Register that exact callback in the Discord Developer Portal. Preserve its database and private environment during restarts.
7. Update `config/deployment.jsonc` production `KINETIC_ADMIN_ORIGIN` to the actual Worker HTTPS origin and `PUBLIC_STATUS_URL` to that origin plus `/v1/public/status`. The website's `ACCESS_AUDIENCE` is its existing staff/preview application setting, **not automatically the backend machine application's audience**; configure Pages staff/preview protections according to `docs/cloudflare-deployment.md`. Never reuse the backend audience as a human audience.
8. Validate configuration with `npm run config:check -- --environment production`, then use the normal owner-approved Pages deployment process. Do not change DNS or enable a second website deployment workflow.

Use separate backend, VPC service, identities and settings for staging; this config targets production only. Tests use synthetic transport/JWT responses and do not prove live Tunnel, Access, Discord, or bot readiness. Verify the bot's deployed branch implements every requested endpoint; the website's newer authoring interfaces may require backend updates.

The smoke test caps its compatibility date at the bundled workerd version's supported date and prints any difference. This keeps the lockfile unchanged while retaining the new Worker's deployment date of `2026-11-01`. A local smoke pass does not establish behavior under newer compatibility changes; validate the configured deployment date in Cloudflare before enabling staff access.

## Acceptance before live use

Prove public status works while admin calls with no token, wrong token, wrong audience and wrong environment fail. Then test `/dashboard enable`, Discord login, denied enrollment, role removal, session expiry, logout, safe failures during tunnel outages, authorized reads and one explicitly approved mutation. Verify private cookies and service credentials never appear in public responses or logs. Test uploads and private images only if the deployed bot supports their contracts.

Record the gateway deployment ID and previous non-secret configuration before changes. Rollback restores the prior Worker deployment and matching trust settings; it does not reverse backend operations or session records.

References: [Workers VPC setup](https://developers.cloudflare.com/workers-vpc/get-started/), [Workers Access protection](https://developers.cloudflare.com/workers/configuration/cloudflare-access/), [Access service tokens](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/).
