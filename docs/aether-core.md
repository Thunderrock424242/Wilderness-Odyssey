# Aether Core

Aether Core is an optional, self-contained feature module inside the existing Wilderness Odyssey Discord bot. It uses the same Discord client, application token, slash-command deployment, SQLite database, logger, HTTP server, and shutdown path as the rest of the bot. It does not create another Discord application, client, token, or bot account.

If Aether is disabled or fails to initialize, the existing support, report, suggestion, moderation, playtest, diagnostic, and Minecraft verification features continue to start normally.

## Architecture

```text
Wilderness Odyssey Discord bot
├── Existing commands and services (unchanged)
├── Existing SQLite database
├── Existing support HTTP server
└── Aether Core
    ├── Discord /aether adapter
    ├── Platform-neutral request router
    ├── Context and permission managers
    ├── AI provider abstraction + scripted fallback
    ├── SQLite memory abstraction
    ├── Authenticated Minecraft bridge adapter
    └── Internal agents
        ├── General
        ├── Lore
        ├── Support
        ├── Diagnostics
        ├── Quest
        └── Reports
```

Discord and Minecraft requests are converted into the same `AetherRequest` shape. The router and agents do not depend on Discord interaction types, so a trusted server bridge can use the same routing path later.

## Commands

- `/aether help` lists the Aether command surface.
- `/aether ask question:<text>` chooses an internal agent using deterministic routing rules.
- `/aether status` shows safe availability information for the core, provider, memory, bridge, and agents. It never displays secrets or internal addresses.
- `/aether lore query:<text>` sends the request directly to the Lore Agent.
- `/aether diagnose file:<attachment> context:<optional>` validates a text attachment, enforces the size/type policy, downloads only from Discord's HTTPS attachment hosts, rejects binary content, redacts obvious secrets and local paths, and sends the text to the Diagnostics Agent. Uploaded content is never executed.
- `/aether link` creates a high-entropy, one-time link code in the existing Minecraft verification tables.
- `/aether unlink confirm:true` removes the requesting user's Minecraft association.
- `/aether profile` shows only the requesting user's private Aether profile.
- `/aether settings` views or changes the supported preferences for conversation-summary memory, Minecraft notifications, response detail, and privacy mode.

Run `npm run deploy` after changing `AETHER_COMMAND_ENABLED` so Discord receives the updated command set.

## Configuration

Aether environment variables follow the bot's existing `.env` configuration pattern. See `.env.example` for copy-ready defaults.

| Variable | Safe default | Purpose |
| --- | --- | --- |
| `AETHER_ENABLED` | `false` | Enables Aether initialization. Missing configuration leaves Aether off. |
| `AETHER_COMMAND_ENABLED` | Same as `AETHER_ENABLED` when omitted | Adds `/aether` to command deployment. It may remain on while the core is off so `/aether help` and `/aether status` can explain the state. |
| `AETHER_AI_PROVIDER` | `scripted` | Selects `scripted` or `disabled`. Unsupported values disable the provider and record a safe warning. |
| `AETHER_MEMORY_ENABLED` | Same as `AETHER_ENABLED` when omitted | Enables Aether's SQLite-backed profile and preference operations. |
| `AETHER_MINECRAFT_BRIDGE_ENABLED` | `false` | Enables the authenticated Aether endpoint on the existing support HTTP server. |
| `AETHER_MINECRAFT_BRIDGE_SECRET` | unset | Random shared secret used as an HTTP Bearer token. The bridge refuses to start unless it contains at least 32 characters. |
| `AETHER_LINK_CODE_EXPIRATION_MINUTES` | `15` | Link-code lifetime; accepted range is 1-60 minutes. |
| `AETHER_MAX_ATTACHMENT_BYTES` | `2097152` | Maximum diagnostic attachment size; constrained to 1 KiB-10 MiB. |
| `AETHER_ALLOWED_DIAGNOSTIC_FILE_TYPES` | `txt,log,crash` | Comma-separated allowlist selected from `txt`, `log`, `crash`, `md`, and `json`. |
| `AETHER_RATE_LIMIT_REQUESTS` | `8` | Expensive routed requests allowed per user and window. |
| `AETHER_RATE_LIMIT_WINDOW_SECONDS` | `60` | Rate-limit window in seconds. |
| `AETHER_LORE_FILE` | unset | Optional UTF-8 text/Markdown lore source, limited to 256 KiB. |

Invalid values use safe defaults or disable the affected component. Aether initialization is wrapped independently so its failure is logged as a warning and does not stop the Discord client.

## AI providers

`AetherModelProvider` defines `isAvailable()`, `generateResponse()`, `getProviderName()`, and `close()`. The initial providers are:

- `scripted`: deterministic local responses with no API key or network model.
- `disabled`: reports the AI provider as unavailable while a resilient wrapper keeps the scripted fallback working.

Ollama and hosted providers are intentionally not wired yet. A future provider should implement the interface, read credentials/addresses from server-side configuration, and be selected in the provider factory. Never place provider secrets in a Minecraft mod or Discord response.

## Memory and migrations

Aether uses the existing `node:sqlite` database and startup migration path. Migrations are additive and use `CREATE TABLE IF NOT EXISTS`; no existing table or row is deleted or rewritten.

The existing `minecraft_link_codes` and `minecraft_links` tables remain the shared source of truth, so `/minecraft` and `/aether` do not create competing identities. Aether adds:

- `aether_user_preferences`
- `aether_conversation_summaries`
- `aether_lore_discoveries`
- `aether_diagnostic_history`

Conversation memory is off by default. The abstraction stores only short summaries after the user enables it; turning it off deletes that user's stored summary. The current initial router does not automatically generate conversation summaries. Diagnostic history stores a request reference and cause summary, not the uploaded log body.

## Minecraft linking

1. A Discord user runs `/aether link`.
2. Aether invalidates that user's earlier pending code and creates a random ten-character code.
3. The code expires after `AETHER_LINK_CODE_EXPIRATION_MINUTES` and can be used only once.
4. The trusted server or existing verification relay submits the code with a Minecraft UUID and current display name.
5. The permanent association is keyed by the normalized Minecraft UUID. Usernames are display metadata only.

Codes are returned only in an ephemeral Discord response. Aether does not write plaintext codes to normal logs.

## Minecraft bridge

The initial transport reuses the existing support HTTP server and exposes:

```text
POST /api/aether/bridge
Authorization: Bearer <AETHER_MINECRAFT_BRIDGE_SECRET>
Content-Type: application/json
```

Only these inbound actions are allowlisted:

- `complete_link`
- `player_question`
- `crash_report`
- `server_status`

Each payload is schema-validated with strict objects and size limits. Client-supplied permissions and unknown fields are rejected. Player context must come from the trusted server-side integration; the Minecraft client should send requests through its server or integrated server. There is no remote console action, arbitrary command execution, unrestricted Discord-to-Minecraft messaging, or outbound announcement transport.

The built-in Node server is plain HTTP. Keep it behind a firewall or an HTTPS reverse proxy, do not expose the shared secret to Minecraft clients, and rotate the secret if the trusted server or proxy is compromised.

The recommended future flow is:

```text
Minecraft client
→ Minecraft dedicated/integrated server
→ authenticated Aether bridge endpoint
→ platform-neutral Aether router
```

Future quest context, discovered lore, world events, server status details, and approved announcements should extend the strict bridge schema and explicit action allowlist. Do not add a second HTTP/WebSocket framework unless the existing support server can no longer meet the requirement.

## Adding an internal agent

1. Implement `AetherAgent` under `src/aether/agents/` with a unique internal name, availability check, and safe `handle()` method.
2. Add it to `createAetherAgents()`.
3. Add deterministic routing rules in `src/aether/router.ts`, or use an explicit `agentHint` from a trusted command handler.
4. Add a centralized label in `src/aether/presentation.ts`.
5. Add routing, failure, and permission tests. Keep the agent platform-neutral and do not import Discord interaction types.

## Current limitations

- Lore uses a small clearly marked placeholder unless `AETHER_LORE_FILE` is configured.
- The Quest Agent has no authoritative quest/progression feed yet.
- Ollama and hosted model adapters are not implemented; the scripted fallback remains available.
- Conversation-summary storage is implemented, but automatic summarization is not.
- Minecraft-notification preference storage is implemented, but outbound notifications are not.
- The bridge has no remote console or outbound announcement action by design.
- The bridge relies on an operator-managed HTTPS reverse proxy or private network; TLS termination is not implemented inside the bot.
- Diagnostic analysis uses the existing deterministic crash-signature rules; it does not execute files or scrape private external reports.
