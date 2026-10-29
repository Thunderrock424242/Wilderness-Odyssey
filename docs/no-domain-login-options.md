# Discord login without buying a domain

Investigation dated 2026-10-29. This is a proposed deployment design, not a live connection. Production staff access remains disabled until the connection and authentication checks pass.

## Recommended route to validate

Keep the Astro website on its existing `wilderness-odyssey.pages.dev` address. Add a small Cloudflare Worker on the account's assigned `workers.dev` hostname. Connect that Worker to the existing Kinetic backend using Workers VPC and a remotely managed Cloudflare Tunnel.

```text
Browser -> Pages website / Pages Functions
        -> Access-protected workers.dev gateway
        -> Workers VPC / encrypted Cloudflare Tunnel
        -> cloudflared beside the bot -> loopback HTTP API
```

The internet-facing hops use HTTPS. The final HTTP connection stays on the Kinetic container's loopback interface; it must not cross the public internet. Kinetic's reverse-proxy form and an independently purchased domain are not needed for this route.

Cloudflare documents a private service target of `localhost` and custom HTTP ports. Its Workers Access integration supports protecting a `workers.dev` hostname or individual path. This combination appears to fit the existing backend contract; it still needs validation against the actual Cloudflare account and Kinetic runtime.

## Preserve the existing authorization model

- Protect the gateway's administrative path with a Cloudflare Access Service Auth policy for the production Pages service token.
- Have the Worker independently validate the signed Access assertion before forwarding administrative requests. Missing configuration must deny requests.
- Forward only approved API paths to one fixed VPC Service binding. Do not accept an upstream URL, host or tunnel target from a request.
- Forward the verified machine assertion, environment and existing opaque staff credential. Do not forward the service-token client secret to the bot or log authentication headers, codes or session tokens.
- Keep the bot's existing checks for machine issuer, audience, exact service identity, environment, active dashboard enrollment and current Discord Administrator permission.
- Public status needs a separate, narrowly scoped route that permits only the sanitized status response. Protecting the entire Worker would also block the website's unauthenticated public-status request.
- Keep preview credentials, backend and policies separate from production.

The website callback remains:

```text
https://wilderness-odyssey.pages.dev/api/auth/discord/callback
```

Discord application credentials stay on Kinetic. Pages runtime secrets remain in Cloudflare. Public deployment JSON contains only non-secret settings.

## Prerequisites to confirm before implementation

1. Kinetic permits an additional persistent `cloudflared` process alongside Node, with a startup/shutdown arrangement that manages both processes. An editable shell startup command or alternate startup-flag preset is not required: the bot branch already has an `index.js` launcher that uses Node's child-process API to build the bot before loading its compiled entry point. Connector support could be added to that launcher while keeping Kinetic's Main File set to `index.js`. Executing the connector binary on this hosting plan still needs validation.
2. The Kinetic container permits outbound QUIC traffic on UDP port 7844. Workers VPC requires QUIC; a TCP-only fallback is insufficient for this feature.
3. The Cloudflare account can create a Tunnel and VPC Service and bind a Worker to that service. Cloudflare lists Connectivity Directory Admin/Bind roles for these operations.
4. The existing bot branch deployed on Kinetic includes the connected API and Discord dashboard authentication code. A public health/status response confirms HTTP connectivity, not working administrator authentication.

Use `cloudflared` 2025.7.0 or later, from the official distribution. Keep its tunnel credential private on the server. Do not use an expiring Quick Tunnel hostname as the production backend address.

## Changes needed if the prerequisites pass

1. Add a focused gateway Worker, its editable deployment settings and meaningful authorization/routing tests.
2. Configure a remotely managed Tunnel and a VPC Service targeting the bot on loopback port `25599`.
3. Add optional supervised connector startup to the bot deployment's existing `index.js` launcher, preserving its build-failure behavior. Keep Kinetic's Main File at `index.js`; no additional Node startup arguments are needed for this design. Verify that the tunnel reconnects after a restart and that shutdown stops both processes.
4. Configure the gateway Access application and production service token. Set the corresponding machine audience, team origin and signed service identity on the bot.
5. Register the exact Discord callback and configure the bot's current `STAFF_AUTH_MODE=discord`, `DISCORD_REDIRECT_URI` and Discord application secret settings.
6. Configure Pages runtime secrets and the non-secret gateway/status URLs. Enable staff access only after checking the complete authenticated path.
7. Once the tunnel works, bind the bot HTTP API to loopback so administrative traffic cannot use the public allocation.
8. Validate real login, enrollment, denial without enrollment, role removal, logout, machine-authentication failures and tunnel outages. Keep the public site usable during backend outages.

Do not switch the existing website to raw public HTTP or remove the backend's machine checks to bypass deployment requirements.

## Cost and lifecycle

Cloudflare currently makes Workers VPC available to all Workers plans at no additional charge during open beta. Normal Workers request/compute limits apply; the Workers Free plan currently includes 100,000 requests per day and a 10 ms CPU allowance per invocation. The Free allowance is shared with other applicable account usage.

This avoids a domain purchase. It is not a promise of permanent free VPC pricing or guaranteed compatibility with the hosting provider. Recheck availability and pricing before deployment and when the beta ends.

## Primary references

- [Workers VPC setup, localhost targets and custom ports](https://developers.cloudflare.com/workers-vpc/get-started/)
- [Tunnel version and QUIC requirements](https://developers.cloudflare.com/workers-vpc/configuration/tunnel/)
- [Access protection for workers.dev hosts and paths](https://developers.cloudflare.com/workers/configuration/cloudflare-access/)
- [Access service-token authentication](https://developers.cloudflare.com/cloudflare-one/access-controls/service-credentials/service-tokens/)
- [Workers VPC beta pricing](https://developers.cloudflare.com/workers-vpc/platform/pricing/)
- [Workers pricing and Free allowance](https://developers.cloudflare.com/workers/platform/pricing/)
