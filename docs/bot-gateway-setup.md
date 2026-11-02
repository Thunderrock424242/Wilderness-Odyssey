# Bot gateway Worker

The separate Worker in `workers/bot-gateway/` connects Pages to the Kinetic bot through the fixed private VPC service, targeting `127.0.0.1:25599` through the tunnel. It is not included in website browser bundles or deployed by the Pages workflow.

## Validation

```sh
npm run bot-gateway:types
npm run bot-gateway:check
npm test -- tests/botGateway.test.ts
npm run bot-gateway:smoke
npm run verify
npm run test:e2e
```

Commit all Worker source, Wrangler configuration, TypeScript configuration, generated binding declarations, and tests together with the package scripts. `.wrangler/` and compiled output remain ignored. The smoke command packages locally and tests workerd using synthetic service responses; it does not deploy or contact the bot. Its compatibility date is capped at the bundled workerd-supported date and printed when different from production.

## Current deployment

Origin: `https://wilderness-odyssey-bot-gateway.thunderrock-labs.workers.dev`.
Version: `26d32a1d-b4d1-4748-8e1c-e1e07992cdd3`.

`GET /v1/public/status` projects the bot's response through the shared status schema and allows 15 seconds of caching. Approved admin method/path combinations require a signed Access JWT matching the configured issuer, audience, service identity, timestamps and environment. The bot independently checks machine trust, Discord enrollment, current Administrator permission and operation authorization. This gateway supports Discord staff mode and does not forward legacy human Access assertions.

Only approved request headers reach the bot. Client secrets and cookies are stripped. Bodies have route-specific limits and a 15-second deadline, redirects are not followed, private responses are uncached, and upstream errors are sanitized. Private images are limited to 12 MiB.

The Access self-hosted application protects only `/v1/admin/*` on the exact gateway hostname using the reusable Pages production gateway Service Auth policy and the owner's Wilderness Odyssey token. Public status remains available. Both Pages machine credentials and an independent CSRF secret have been saved in the production runtime; no secret values belong in this repository.

## Remaining activation

Match `ACCESS_TEAM_DOMAIN`, `BACKEND_ACCESS_AUDIENCE`, `GATEWAY_SERVICE_ID` and `CONNECTED_ENVIRONMENT=production` on Kinetic with the Worker's non-secret configuration. Configure Discord OAuth and the exact callback `https://wilderness-odyssey.pages.dev/api/auth/discord/callback`. Preserve the bot database and private environment. Complete the separate Pages staff/preview audience and protections, then deploy the website through the existing approval-gated workflow.

The backend machine audience is distinct from the website's human/preview `ACCESS_AUDIENCE`; never reuse it as a human audience. Keep staging services and credentials separate. Test live login, enrollment, role removal, logout, denied machine identities and outages before enabling staff use. Presence of saved credentials alone does not establish successful authentication.
