# Cloudflare Tunnel beside the Kinetic bot

The Kinetic Main File remains **`index.js`**, Additional Arguments remain blank, and the runtime remains Node.js 22. The existing launcher builds the bot, then optionally starts the Cloudflare connector alongside it. It does not require `sudo`, a system service, Docker access or editable shell startup flags.

This connects a private backend to Workers VPC without purchasing a domain or using Kinetic's Reverse Proxy form. The website stays at `https://wilderness-odyssey.pages.dev`. A separate protected Worker, VPC Service, Access settings and Discord OAuth setup are still required before website login works.

## 1. Create the tunnel

In Cloudflare's Workers VPC dashboard, create a remotely managed Cloudflared tunnel. The tunnel prepared for this deployment is:

- Name: `wilderness-odyssey-bot`
- ID: `2e826da1-bd4f-4521-80d2-7469050aae7f`

Keep its connection token private. The tunnel ID is not the credential. You can leave the Cloudflare page and retrieve the token from the dashboard later.

## 2. Deploy the launcher change first

Review and deploy this bot-branch change to Kinetic using the existing Git/file deployment process. Preserve the current private `.env`, database and other persistent data. The connector is disabled by default; normal bot startup remains available while setup is incomplete.

No new slash commands or npm packages are added. The TypeScript build is still the existing launcher's prerequisite; the connector itself uses only compiled application code and Node's built-in APIs.

## 3. Enter the credential directly on Kinetic

Add or update these two settings in Kinetic's private environment or the bot's ignored `.env` file:

```dotenv
CLOUDFLARED_ENABLED=true
CLOUDFLARED_TUNNEL_TOKEN=
```

After the second `=`, paste only the full tunnel token from Cloudflare, not the `cloudflared service install` command. Do not put the token in Git, a screenshot, chat, the website's deployment JSON or Additional Arguments. Preserve all other existing settings.

Restart the bot through Kinetic's normal controls. On the first enabled start, the connector downloads the official `cloudflared` **2026.10.6** binary for Linux x64 or arm64, checks its pinned SHA-256 digest and caches it under ignored `data/cloudflared/`. Later starts verify the cached binary before using it. Each download is limited to 60 seconds and 100 MiB. Automatic native updates are disabled; updating the release requires a reviewed manifest change.

The token is supplied to the child through `TUNNEL_TOKEN`, not process arguments. The connector does not inherit Discord, backend or Access credentials. Output is bounded and the known token is redacted, including when split across chunks.

## 4. Check actual connection health

The bot log should first report `Cloudflare connector process started; check tunnel health in Cloudflare.` This confirms a process was launched, not that a tunnel connection is healthy.

In Cloudflare, confirm that this exact tunnel is **Healthy/Connected**. Keep `CONNECTED_ADMIN_ENABLED=false` until the protected gateway and authentication configuration have been validated.

The connector uses QUIC and needs outbound UDP **7844** from Kinetic. If the host blocks this traffic, Workers VPC will not work through a TCP-only fallback. Unsupported hosts, bad credentials, network/download failures and process failures report `service: cloudflare-tunnel`, `event: unavailable` with a safe reason. The Discord bot continues running. Fix the issue and restart using Kinetic's normal controls; the launcher does not create an unlimited subprocess restart loop.

To turn the connector off, set `CLOUDFLARED_ENABLED=false` and restart. The launcher stops the connector when the bot exits and cancels an installation in progress.

## 5. Complete the dependent gateway setup

Once the connector is healthy:

1. Create a VPC Service associated with this tunnel, targeting `127.0.0.1` and custom HTTP port `25599` from inside the Kinetic container. Use the tunnel as resolver if requested.
2. Deploy the proposed gateway Worker with a fixed VPC Service binding. Protect its administrative route using a dedicated Access Service Auth policy. Its public-status route must expose only the sanitized public response.
3. Configure the bot's machine issuer/audience/service identity, Discord application secret and exact callback. Keep all existing backend enrollment and live Discord permission checks.
4. Configure the Pages runtime secrets and non-secret gateway/status URLs, then validate real login, denied access, permission removal, logout and tunnel outages.
5. After the tunnel and gateway work, change `MINECRAFT_VERIFY_API_HOST` to `127.0.0.1`, removing the need for public HTTP access to the bot. Account for any other approved integration using that shared HTTP API before changing its bind address.

The connector alone does not serve an HTTPS public hostname or authenticate administrators. See [the no-domain deployment design](no-domain-login-options.md).

## References

- [Workers VPC setup and loopback targets](https://developers.cloudflare.com/workers-vpc/get-started/)
- [Tunnel version and QUIC requirements](https://developers.cloudflare.com/workers-vpc/configuration/tunnel/)
- [Cloudflare token and run parameters](https://developers.cloudflare.com/cloudflare-one/networks/connectors/cloudflare-tunnel/configure-tunnels/run-parameters/)
- [Pinned official connector release](https://github.com/cloudflare/cloudflared/releases/tag/2026.10.6)
