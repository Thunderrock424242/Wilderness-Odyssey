# Kinetic Tunnel Launcher Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Run an optional Cloudflare Tunnel connector alongside the existing Kinetic-hosted bot, using its current `index.js` Main File.

**Architecture:** Implement this change on the repository's bot branch in an isolated checkout. Its existing launcher will still build the bot before starting the compiled application; a separate optional service will obtain a pinned, checksum-verified official connector and manage its lifetime. Connector failure must report that the tunnel is unavailable without terminating the Discord bot.

**Tech Stack:** Node.js 22, existing TypeScript and node:test/tsx tooling, Node child-process and filesystem APIs, official cloudflared 2026.10.6 Linux binaries. No new npm runtime dependency.

**Spec:** `docs/no-domain-login-options.md` on the website branch. This plan implements only connector startup; the Access-protected gateway Worker and live login validation remain a separate dependent deliverable.

## Global constraints

- Main File remains `index.js`; Additional Arguments remain empty.
- The existing bot build failure must still prevent loading an outdated build.
- `CLOUDFLARED_ENABLED=true` explicitly opts in; absent or false means no connector download or subprocess.
- Read the credential from `CLOUDFLARED_TUNNEL_TOKEN` in Kinetic's private environment or ignored `.env` file. Pass it to the connector through its supported `TUNNEL_TOKEN` environment variable, never argv.
- Use QUIC for Workers VPC. Kinetic must permit outbound UDP port 7844.
- Do not enable connected administration, alter Discord permission checks, or change the website's staff mode in this step.
- No tunnel credential, binary, cache or local `.env` enters Git.

## Review focus

1. Disabled connector settings leave the normal bot startup unchanged and perform no networking.
2. Missing credentials, unsupported platforms and binary validation failures produce safe diagnostics while the bot remains available.
3. Neither child-process arguments nor logs contain the tunnel token; the connector does not inherit unrelated bot credentials.
4. An interrupted or modified download is never executed, including an invalid cached binary.
5. Shutdown during download or execution cannot leave an orphan connector or start one after shutdown.

## Task 1: Verified connector installation

**Files on bot branch:**
- Create: `src/services/cloudflaredBinary.ts`
- Test: `test/cloudflared-binary.test.ts`
- Modify: `.gitignore`, only if the selected data cache is not already ignored.

**Interfaces:**
- Produces: `ensureCloudflaredBinary(options: { root: string; platform: NodeJS.Platform; arch: string; signal: AbortSignal; fetcher?: typeof fetch }): Promise<string>`.
- Returns a verified executable path inside the ignored application data cache.

- [ ] Establish the bot checkout's baseline with `npm ci`, `npm run check`, `npm test` and `npm run build`; preserve unrelated changes.
- [ ] Add failing tests for a valid cached binary, a modified cache entry, a checksum mismatch, a truncated/oversized response, timeout/cancellation and unsupported platform/architecture. Use temporary directories and synthetic HTTP responses; do not execute downloaded software in unit tests.
- [ ] Run the focused tests and confirm that they fail because the installer is absent.
- [ ] Implement the installer for Linux x64 and arm64. Pin official release URLs and the vendor-published SHA-256 values for 2026.10.6 after checking the release metadata. Bound each download to 60 seconds and 100 MiB, verify before atomic installation, and remove incomplete downloads. Revalidate cached content before execution. Reject platform/architecture values outside the explicit mapping.
- [ ] Run the focused tests and require all cases to pass.

## Task 2: Optional connector lifetime and launcher integration

**Files on bot branch:**
- Create: `src/services/cloudflareTunnel.ts`
- Modify: `index.js`, `.env.example`
- Create: `docs/kinetic-cloudflare-tunnel.md`
- Test: `test/cloudflare-tunnel.test.ts`

**Interfaces:**
- Consumes: `ensureCloudflaredBinary(...)` from Task 1.
- Produces: `startCloudflareTunnel(options: { root: string; env: NodeJS.ProcessEnv }): { stop(): void }` with nonblocking startup and injected process/network boundaries for tests as needed.
- The launcher calls this service after a successful build, registers shutdown cleanup and loads the existing compiled bot. Optional connector setup must not delay loading the bot on a network request.

- [ ] Add failing tests for disabled operation, missing token, safe child-process arguments/environment, connector spawn/exit failures, token redaction across output chunks, shutdown during installation, and child termination on shutdown. Include a launcher regression check that a failed build does not load the bot and a connector failure does not prevent bot startup.
- [ ] Run the focused tests and confirm that they fail because optional connector support is absent.
- [ ] Implement startup with fixed connector arguments, automatic updates disabled and QUIC selected. Pass only the credential and necessary operating environment to the connector; do not inherit Discord, Access or backend secrets. Suppress or redact token-bearing output before it reaches the logger. Report connector failure safely and leave the bot running; use the connector's documented bounded connection retries rather than adding an unlimited supervisor restart loop.
- [ ] Implement idempotent shutdown: cancel installation, prevent a late spawn, terminate a running child and clean up listeners/timers. Preserve the bot's existing graceful-shutdown handlers.
- [ ] Document the optional settings and deployment procedure using the existing Main File. Record the non-secret tunnel name `wilderness-odyssey-bot` and ID `2e826da1-bd4f-4521-80d2-7469050aae7f`; the user enters the token directly on Kinetic. Explain that creating the tunnel alone does not connect it or enable website login.
- [ ] Run focused tests, then `npm run check`, `npm test`, `npm run build` and `git diff --check`. Review the diff for secrets and startup regressions.
- [ ] Make the validated bot-branch change available for review before a hosted restart. Confirm a real Kinetic connector appears healthy in Cloudflare before preparing the gateway Worker or changing the HTTP bind address.

## Separate gateway work after the connector is healthy

Create a fixed-target Worker with a VPC Service binding, a narrow public-status route, and an Access-protected administrative route. Preserve backend JWT verification and current Discord enrollment/permission checks. Configure Pages runtime secrets and non-secret URLs, then validate real login and revocation before enabling production staff access. Tunnel health alone is not evidence that this second deliverable works.
