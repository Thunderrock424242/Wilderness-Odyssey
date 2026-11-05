# Hosted Aether chat deployment

Implementation starts at bot `903d23a8fc3b92b02c9b8727fca96eaa36cb99be` on `bot` and API `e9c0d22d` on `in-dev` (contains Qwen acceptance `7f4bd3f6`). Both local API commits were found; they were not assumed to be on GitHub. Deploy the new commits from **both** repositories together. Pinned playground contracts under API `docs/ai/contracts/60a9620` are unchanged.

`/aether ask` still uses existing authorization, routing, per-user limits and private replies. General conversation uses the remote provider; specialized lore/support/diagnostic/quest/report routing stays deterministic. A deterministic answer is not evidence of Qwen inference. Remote failures return errors, never scripted model success. `/aether status` probes inference admission/model identity; readiness is not a capacity measurement or proof of a completed generation. Status expires after 30 seconds.

## Contract and privacy

`POST /v1/aether/chat` accepts exactly `schemaVersion: '1.0'`, UUID `requestId`, configured `serverId`, `surface: discord|minecraft`, opaque 64-character lowercase hex `principalId` and `scopeId`, and `message` (1–2000 characters). It returns exactly `schemaVersion`, `requestId`, `serverId`, `model`, `success: true`, `response` (1–2000 characters). Matching fixtures are `test/fixtures/aether-chat-v1.json` in the bot and `aether-server/src/test/resources/aether-chat-v1.json` in the API. Bot schemas are `src/contracts/v1/aether-chat.ts`; API parser is `ChatRequest`.

`GET /v1/aether/chat/status` returns exactly `schemaVersion: '1.0'`, `serverId`, `model`, `available`. Both routes require the existing **inference** bearer scope. Native `/v1/aether/generate`, `/v1/aether/status`, `/health`, `/ready`, admission and playground endpoints keep their contracts. Chat and native generation share native admission, rate limits, bounded queue, concurrency and one total draft-plus-verification deadline. Failures are sanitized HTTP 400/401/403/408/413/429/503; no retry or model substitution occurs.

Chat is stateless: a single user turn plus server-owned instructions; no retained history, profile, Discord name/ID, linked UUID, Minecraft state or conversation summary is exported. Bot HMAC identifiers include surface and user, plus guild/server for scope; they are protocol metadata and never put in model prompts. No cross-surface memory sharing is added. Existing verified linking/consent and memory ownership remain local. Training/example ingestion and candidate activation are never called. No tools or authoritative gameplay actions are returned.

## Private bot environment

Set these only in Kinetic environment settings or its private ignored `.env`:

```dotenv
AETHER_ENABLED=true
AETHER_COMMAND_ENABLED=true
AETHER_AI_PROVIDER=remote
AETHER_INFERENCE_ORIGIN=https://REPLACE-WITH-OPERATOR-APPROVED-GATEWAY
AETHER_INFERENCE_SERVER_ID=wilderness-server
AETHER_INFERENCE_MODEL=qwen3.5:4b
AETHER_INFERENCE_TOKEN=
AETHER_INFERENCE_TIMEOUT_MS=35000
AETHER_INFERENCE_CONCURRENCY=1
AETHER_INFERENCE_GUILD_REQUESTS_PER_MINUTE=20
AETHER_INFERENCE_GLOBAL_REQUESTS_PER_MINUTE=30
AETHER_RATE_LIMIT_REQUESTS=8
AETHER_RATE_LIMIT_WINDOW_SECONDS=60
```

`AETHER_INFERENCE_ORIGIN` is one fixed HTTPS origin with no userinfo, path, query or fragment. The operator must supply the real private service address; no address has been provisioned by this change. No Discord user can override it. Redirects are rejected. The inference bearer is 32–256 characters in `[A-Za-z0-9._~-]`; it must match API `AETHER_INFERENCE_TOKEN`. All monitoring, administration, main-service, identity and bridge secrets must be distinct from it. Public clients/browsers never receive any service credential. A trusted Minecraft **server process** may retain the existing inference-only credential; Minecraft clients must not receive it. This change adds no authority to that scope.

The new provider is independent of `AETHER_GATEWAY_*` administration setup and never sends its monitoring/admin/Access credentials. If the approved inference ingress uses additional machine authentication, provision an inference-specific adapter/identity before deployment; do not reuse the admin sandbox or weaken an existing Access policy. The private HTTPS ingress must reach only the intended loopback gateway, authenticate/restrict trusted callers, preserve Authorization, and allow the two chat routes alongside the existing Minecraft routes. Raw Ollama is never exposed.

## Host prerequisites — verification still required

An authenticated Kinetic panel home page was reached, but browser control timed out and then stopped because it could not reliably verify the current URL. No server allocation detail, SSH access or approved inference origin was obtained. The last reported split of 7 GiB Minecraft + 1 GiB bot does not establish Qwen capacity. Do not put the model in the bot container or reduce Minecraft's allocation based on the 2.71 GB GGUF size.

Open [Kinetic Panel](https://kineticpanel.net/), select **Your Servers**, then open each server's resource allocation and Startup/Settings views. Record RAM limit, CPU quota and architecture, GPU model/VRAM or confirmed absence, permitted executables/extra processes or containers, persistent model/state storage and free space, and outbound/private network capability. Ask Kinetic support if those details are hidden. Inference requires a supported Ollama runtime, JDK 21 for the standalone gateway, and a measured memory/CPU/GPU budget including runtime/context overhead under concurrent Minecraft load. Use a separate inference host if the existing allocation cannot pass those checks. Verify private connectivity from both bot and Minecraft server without exposing runtime ports.

Qwen acceptance in API `docs/ai/aether-teacher-qwen-acceptance-2026-11-04.md` records a real local Ollama 0.17.7 response, not hosted readiness. Use the operator-approved Qwen base (review its pinned artifact identity) or an explicitly reviewed Teacher export. Never select the synthetic acceptance candidate automatically.

Private runtime starting settings, subject to actual host admission:

```dotenv
OLLAMA_HOST=127.0.0.1:11434
OLLAMA_MODELS=/srv/aether/ollama-models
OLLAMA_CONTEXT_LENGTH=8192
OLLAMA_NUM_PARALLEL=1
OLLAMA_MAX_LOADED_MODELS=1
OLLAMA_MAX_QUEUE=8
OLLAMA_NO_CLOUD=1
```

Use persistent owner-private volumes for `OLLAMA_MODELS` and gateway state. Preserve admission journals and the existing private playground state; do not reset either to bypass commissioning. Supply distinct API `AETHER_INFERENCE_TOKEN`, `AETHER_MONITORING_TOKEN`, `AETHER_ADMINISTRATION_TOKEN`, `MAIN_SERVER_READ_TOKEN`, `MAIN_SERVER_WRITE_TOKEN` only for enabled approved scopes. Unset admin/main-service write credentials remain disabled. Training stays disabled on this host; keep existing playground configuration only when separately approved. `deploy/aether-inference.example.yml` is a **disabled template**, not an activation record.

Gateway draft and verifier explicitly send `think: false`, `format: 'json'`, configured context/output limits, and one shared 30-second deadline. Test those exact calls on the chosen runtime: Teacher's local text chat acceptance does not establish hosted JSON-mode compatibility or enough context for the full server-owned canon. The disabled deployment template uses 8192 context tokens on both gateway and runtime because the gateway includes its full canon; this needs a separate resource measurement from Teacher's 2048-token starting point. Measure prompt tokens, effective context/truncation, peak memory and latency for both passes. If the approved prompt/message/output budget does not fit, review both limits and repeat capacity admission; do not truncate canon silently or enable thinking to work around empty outputs.

## Import, build, restart and registration

1. On the operator's model host, stop inference admission while importing. For a reviewed Teacher handoff, verify outer `teacher-export.json`, inner `model/package.json`, artifact hashes and profile approval using API's existing export verification workflow. From its verified `model` directory run `ollama create REVIEWED-MODEL-ID -f Modelfile`. For the base, use the approved pinned import workflow; do not silently pull a mutable tag or publish a training-test candidate. Update gateway `ollama.model` and bot `AETHER_INFERENCE_MODEL` to that exact reviewed ID.
2. In API with JDK 21, run `gradlew.bat -p aether-server check assemble` on Windows or `./gradlew -p aether-server check assemble` on Linux. Deploy `aether-server/build/libs/Aether-Gateway.jar` and reviewed private YAML. This is the standalone service, not a Minecraft mod replacement. Existing Minecraft bridge routes and mod remain in place.
3. Start private Ollama using the host's supported process manager. Start the gateway with `java -jar Aether-Gateway.jar --config /srv/aether/aether-server.yml` under the same approved host service setup. Keep `activation.hosting_verified`, `capacity_verified`, `inference_enabled` false until genuine host/model checks and an operator-reviewed commissioning test justify activation; then set them and exact `verified_model`, preserving journal pause state. No startup change here auto-commissions or launches Ollama.
4. Verify HTTPS ingress, native monitoring `/health` and `/ready` with the monitoring scope, and `/v1/aether/chat/status` with inference scope. Status must echo the exact server/model. Check missing/incorrect scopes reject calls and existing native Minecraft inference still works. Perform a private controlled chat POST using the fixture with a fresh UUID and opaque IDs; keep bearer values in private process configuration, never URL/command history/logs. Require an actual validated Qwen answer, not just ready status.
5. In the bot, use Node **22.x, at least 22.13.1**, run `npm ci`, `npm run check`, `npm test`, `npm run build`. Install dev build dependencies during the build stage as the existing launcher requires. Preserve Kinetic Main File `index.js`, Additional Arguments and existing production launcher behavior. Copy source/lockfile through the established deployment process; preserve private `.env`/database. Configure the private variables above, then restart through Kinetic's normal controls.
6. Run `npm run deploy` with existing private `DISCORD_TOKEN`, `CLIENT_ID` and intended `GUILD_ID`. It replaces the application's command set with the repository's complete set; use the intended application/guild. With `AETHER_COMMAND_ENABLED=true`, existing `/aether ask` is registered. No separate chat command is introduced.
7. With an authorized test user, run `/aether status`, then `/aether ask question:Hello Aether`. Confirm prompt ephemeral defer, real matching Qwen answer, no unwanted mentions, and safe unavailable/overload responses when inference is paused or disconnected. Test a second user/guild and verify no context leakage. A banned/restricted/unverified account must remain denied. Test existing Minecraft bridge/native generation under the same shared capacity. No training jobs or candidate changes should appear.

Rollback: set `AETHER_AI_PROVIDER=disabled` (explicit legacy deterministic fallback) or `AETHER_ENABLED=false`, restart the bot; pause native inference through the approved administration path if needed. Do not delete journals, alter pinned contracts, expose Ollama or change hosting startup commands.

## Validation record

Bot `npm run check`, `npm run build` and `npm test` passed (220 tests) on local Node 24.13.1; production Node 22 has not been exercised here. API `gradlew.bat -p aether-server check assemble` passed on JDK 21 (83 discovered, 82 passed, 1 existing skip). An initial Windows executable-test log cleanup failure passed on retry without a source change. Gateway tests use real local HTTP with mocked Ollama. The new tests cover strict shared fixtures, scopes, scoped identifiers, no profile export, response identity/model validation, bounds, timeout/body stalls, cancellation, global concurrency/guild limits, native shared queue/pause, commissioning and model/verifier failure. The command-level test verifies prompt ephemeral defer and mention suppression. Existing authorization/user-limit/Minecraft tests remain in the full suite. Matching fixture SHA256: `21643eb1c983b9589458b77f045158bfed326d713505d9d62a3f52a4bb2a88a7`.

Independent review could not run because the reviewer account hit its usage limit. The author performed a direct diff review; a fresh independent review remains recommended before deployment.

Still unverified: Kinetic resources/process support/persistent storage/private connectivity, approved HTTPS ingress and authentication, actual imported production model and its JSON/no-thinking behavior/context capacity, real hosted generation, command registration against Discord, controlled Discord-to-hosted-Qwen response and live Minecraft regression. Mocks do not prove deployment works.
