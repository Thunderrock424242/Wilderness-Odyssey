# Aether server Codex handoff

Use this in the existing Codex session for [Thunderrock424242/Wilderness-Odyssey-API](https://github.com/Thunderrock424242/Wilderness-Odyssey-API), on its `in-dev` work. The website and Discord bot are separate deployments. This handoff specifies the API/Aether implementation they need; it does not mean a trainer or model has been deployed.

## Copyable message

```text
Please finish the server side of the Wilderness Odyssey website's Aether playground in this Wilderness-Odyssey-API in-dev session. Keep the existing server architecture and actual Minecraft/Aether integrations. Inspect the current code and implement the real peer endpoints, persistence, training worker and tests described in the bot repository's docs/aether-server-codex-handoff.md. Do not create successful-looking stubs.

The exact wire contract is Wilderness-Odyssey bot branch src/contracts/v1/aether-playground.ts, at the same revision as the deployed bot. Copy/freeze that contract and matching fixtures in this repository before implementing Java/server equivalents. Also inspect src/connected/aetherPeer.ts, aetherGatewayClient.ts, mainClient.ts, contracts.ts and src/contracts/v1/admin.ts in that bot revision. The schemas, field names, types, bounds and strictness are authoritative; do not derive an incompatible API from the website's browser routes.

Implement GET /v1/admin/playground/capabilities, POST /v1/admin/playground/sandbox, POST /v1/admin/playground/training/jobs, GET /v1/admin/playground/training/jobs/by-request/:requestId, and POST /v1/admin/playground/training/jobs/by-request/:requestId/cancel. Preserve the existing /health, /ready and /v1/admin/admission contracts exactly. The new capabilities handshake must return the configured serverId, approved model IDs, real supported features, approved training presets and enforced limits. Native health currently has no serverId, so it is insufficient to authorize writes to the intended server.

Sandbox inference must be isolated from production player memory and tools. Training must consume only the bot's immutable, explicitly approved dataset snapshot. Verify SHA-256 over the literal UTF-8 dataset.json string before parsing it as the strict ordered datasetItemsSchema array. Enforce approved base models/presets, permissions, quotas, hardware checks, bounded concurrency, expiry and retention. Persist accepted training jobs before acknowledging them. Return quickly; run real training asynchronously. Repeated identical requestIds return the original job; conflicting payloads fail with 409. Reconcile lost acknowledgements by requestId and never launch another job merely because a response was lost. Cancellation must persist even if it races with submission. Never claim a job completed until a real candidate artifact exists.

Keep monitoring and administration tokens distinct. Require the configured Cloudflare Access service identity as well as the scoped Bearer token when Access protects this service. Never expose credentials or arbitrary upstream URLs to the browser, Discord or the Minecraft client. Never expose arbitrary shell, trainer code, filesystem/model-download URLs or an unrestricted Ollama proxy. Do not automatically activate candidate models or ingest production conversations.

The bot's existing main-server client separately requires GET /v1/service/health, GET /v1/service/capabilities, GET /v1/service/operations/:id and POST /v1/service/operations. Add an API-side adapter matching the actual bot contracts if these do not exist. Populate Minecraft metrics from the real server; return unknown/null when unavailable. Advertise only operations the server really supports; do not advertise model activation or settings writes without their real implementation.

Finish the implementation and meaningful tests, then report the exact commit, supported features/presets/models, required private host environment settings, persistence paths, actual training prerequisites and remaining deployment steps. Tests are not proof of live training. Any production model activation remains a separate reviewed operation.
```

## Contract and ownership

Read the approved [spec](superpowers/specs/2026-11-03-aether-admin-playground.md) and [plan](superpowers/plans/2026-11-03-aether-admin-playground.md). The shared [playground contract](../src/contracts/v1/aether-playground.ts) is the authority for peer requests and responses. Pin it to the exact bot commit used in deployment; do not quietly replace it with a newer incompatible branch version.

The browser uses `/api/admin/v1/aether-playground/*`. Those are **not** the peer endpoint paths. Pages and the gateway validate the browser contract; the trusted bot creates the peer envelope, verifies staff access, owns reviewed examples and snapshots, and calls the fixed API destination. The API owns model runtime, hardware policy, trainer, worker queue, durable peer jobs, candidate artifacts and its deployment. Keep Minecraft gameplay and training implementations out of the bot.

## Required peer endpoints

| Method and path | Bearer scope | Request | Successful response |
| --- | --- | --- | --- |
| `GET /v1/admin/playground/capabilities` | Monitoring | No body | `peerCapabilitiesSchema` |
| `POST /v1/admin/playground/sandbox` | Administration | `peerSandboxRequest` | `sandboxOutput` |
| `POST /v1/admin/playground/training/jobs` | Administration | `peerTrainingRequest` | `peerJobSchema`, after durable acceptance |
| `GET /v1/admin/playground/training/jobs/by-request/:requestId` | Administration | UUID path parameter; no body | Original `peerJobSchema`, or 404 if no job is known |
| `POST /v1/admin/playground/training/jobs/by-request/:requestId/cancel` | Administration | Exactly `{ "requestId": "<same UUID>" }` | `peerCancellationSchema`: current peer job or an explicit durable pre-acceptance cancellation receipt |

Return JSON, private `Cache-Control: no-store`, bounded responses, and no redirects. The caller does not accept upstream HTML or arbitrary error detail. Use 401 for missing/invalid credentials, 403 for insufficient scope, 404 for absent routes/jobs, 409 for revision/idempotency conflicts, 422 for rejected policy/input, 429 for bounded resource/queue limits, and 503 for unavailable dependencies. An unavailable or unimplemented feature must not return fake success.

`peerCapabilitiesSchema` is strict: `schemaVersion: "1.0"`, configured `serverId`, `revision`, `features` containing exactly `sandbox`, `training`, `cancellation`, `admission`; up to 50 unique approved `models` with `{id,label}`; up to 20 unique `presets` with `{id,label,maxExamples}`; and `limits` with `maxMessages`, `maxInputCharacters`, `maxOutputTokens`. Limits must not exceed the contract's 12 messages, 16,000 input characters and 1,024 output tokens. Presets permit 1–100 examples. Feature flags describe real supported operations. Missing hardware, runtime, trainer or allowed presets must produce honest readiness/policy failures.

All new peer jobs must echo `serverId`, `requestId`, `baseModelId`, `presetId` and `datasetHash` exactly. Responses cannot silently substitute a server, model, preset or dataset. Job IDs are stable server-generated identifiers. `progress` is an actual value from 0–1 or `null`; do not invent progress. `candidateModelId` is nullable until an artifact exists and is required for `completed`.

## Native Aether compatibility

Preserve the native `/health` and `/ready` JSON. Native health includes process/dependency fields such as `status`, `ollama`, `ready`, `model`, active/queued generation counts, `paused`, `revision` and `healthy`. Readiness may return 503 when dependencies are not ready. These native responses do not supply the new trusted server identity; verify `serverId` through the capabilities handshake before playground/admission mutations.

`GET /v1/admin/admission` uses the monitoring credential and returns the current admission state, including `{paused,revision,healthy}`. `POST /v1/admin/admission` requires administration authority and accepts the existing strict payload:

```text
requestId: UUID
expectedRevision: integer, 0..9999999999
expiresAt: ISO timestamp, future and at most 300 seconds away
paused: boolean
actor: string matching [A-Za-z0-9._:@-]{1,128}
```

Do not add a `reason` field to this native request. The bot's browser-facing form has a reason, but the native command deliberately excludes it. Check expected revision atomically, retain request-ID idempotency and return the native response compatible with `peerAdmissionSchema`: `paused`, nonnegative integer `revision`, optional `healthy` and optional `replayed`. A replay must not toggle admission again.

## Sandbox inference

Validate the strict peer envelope, intended `serverId`, UUID `requestId`, bounded audit `actor`, expiry, approved `modelId`, message roles/content, total characters, temperature and output bound. Apply both the hard contract ceiling and the lower server-advertised limits. Use the existing controlled model runtime with a deadline and cancellation on client disconnect where practical.

Use an isolated context: no production player memory, production conversation history, Minecraft side effects, agent tools or automatic retention as training data. Return bounded `answer`, exact model/server/request identity, `finishReason` (`stop` or `length`) and observed `durationMs` or `null`. Staff may explicitly save/review an example through the bot; ordinary sandbox calls do not silently create examples.

## Dataset and durable training

`peerTrainingRequest` contains `schemaVersion`, `serverId`, `requestId`, `actor`, `baseModelId`, `presetId`, `dataset: {sha256,json}`, `reason`, `createdAt`, `expiresAt` and `acknowledgeTraining: true`. Every field is bounded by the shared strict schema. A dataset is at most 262,144 UTF-8 bytes; the string character bound is not a substitute for the byte bound.

Compute SHA-256 over the **literal UTF-8 bytes** of `dataset.json`, compare the lowercase 64-character hexadecimal result with `dataset.sha256`, then parse that JSON and validate `datasetItemsSchema`. It is an ordered array of 1–100 strict objects with exactly `{id,revision,prompt,target}`. IDs and revisions identify the reviewed snapshot; prompt/target limits are 4,000/12,000 characters. Do not hash a reserialized, sorted, normalized or reformatted copy. Reject duplicate example identities and samples that cannot fit the selected preset. Retain the immutable snapshot used by the accepted job; later browser edits/deletions must not silently mutate an already accepted dataset.

The bot selects approved examples and snapshots their revisions/targets. The server still validates and authorizes the incoming machine request; it must not replace the snapshot with database searches or automatically append production logs, player chats or unreviewed examples. Store prompts/targets privately and enforce a documented finite retention/erasure policy for snapshots, logs, jobs and candidate artifacts.

Persist acceptance and the original request identity/hash before returning a job. Use a durable uniqueness constraint and atomic transitions. An identical repeated request ID returns the same accepted job; the same request ID with different server, model, preset, dataset or other immutable input returns 409. A crash or lost HTTP acknowledgement cannot result in two training workers for one request. A job accepted before `expiresAt` may outlive the short request window; an expired new request cannot begin training.

Return quickly with `queued` or a truthful existing state. Run the actual trainer in a controlled worker with approved presets, fixed command/argument construction, resource admission, bounded GPU/RAM/CPU/disk usage, concurrency and queue depth. Do not accept user-supplied shell commands, Python, executable paths, model URLs or filesystem destinations. Validate candidate metadata and persistence before moving to `completed`; failed/cancelled jobs do not become successful models.

Use the genuine peer states `queued`, `running`, `cancel-requested`, `completed`, `failed`, `cancelled`. The bot also has local transport states such as `submitting`, `unknown`, `connection-changed`; do not send those as peer states. Reconciliation reads the original request ID without submitting a replacement. Changing a gateway origin, service identity or server ID must never retarget an existing job to another server.

Cancellation is idempotent and durable by request ID. Persist a cancellation tombstone if cancellation wins the race before submission; a late submission with that same ID must not start a trainer. `peerCancellationSchema` permits exactly either the current `peerJobSchema` or `{schemaVersion:"1.0",serverId,requestId,cancelledBeforeAcceptance:true}`. Return that explicit receipt only after the tombstone is committed durably. Do not fabricate a job ID or dataset hash for a request not yet received. A late submission can return a `cancelled` job with the verified dataset/model/preset identity. A bare 404 is not proof cancellation succeeded. If completion already won, return the actual terminal job state. Advertise cancellation only when this persistence and race handling are implemented. Test the receipt and reconciliation paths against the matching bot client.

## Existing main-server adapter

The separate [MainServerClient](../src/connected/mainClient.ts) continues to use these endpoints. Native Aether health/admission alone does not implement this API.

| Endpoint | Credential and contract |
| --- | --- |
| `GET /v1/service/health` | Main-server read token; exact `observationSchema` from [contracts.ts](../src/connected/contracts.ts) |
| `GET /v1/service/capabilities` | Main-server read token; `{schema_version:"1.0",server_id,actions,models,ai_requests_revision}` as parsed in `mainClient.ts` |
| `GET /v1/service/operations/:id` | Main-server read token; matching `operationSchema`, or 404 only when genuinely absent |
| `POST /v1/service/operations` | Main-server write token; durable idempotent operation submission |

Health includes `schema_version`, configured `server_id`, stable-per-boot `boot_id`, monotonically increasing `sequence`, trustworthy `observed_at`, and exact `minecraft`/`aether` objects. Populate player counts, TPS/MSPT, versions, Ollama reachability, inference availability, latency and pause state from real measurements. Use allowed `unknown`/`null` values when unavailable; never fabricate a healthy Minecraft server. Preserve freshness/boot/sequence semantics across restart and stale observations.

Capabilities include exact [modelsSchema](../src/contracts/v1/admin.ts) fields: `schemaVersion`, nullable `activeModelId`, `revision`, approved models with actual readiness/detail, inference settings and permitted ranges. Only advertise supported actions from `ai.pause`, `model.activate`, `inference.settings`, `inference.probe`, `model.unload`. If an action is not actually implemented, omit it; an empty list is valid. In particular, completing a training candidate must not advertise or execute production activation automatically.

Operation submission uses the bot's existing snake-case envelope: `operation_id`, `server_id`, `action`, `parameters`, `expected_revision`, `created_at`, `expires_at`, `actor`, `reason`. Validate against the actual caller in `mainClient.ts` and the per-action inputs in `admin.ts`/`admin` contracts. Bound expiries, check identity/revision atomically, implement request-ID/payload idempotency, and persist before side effects. Return `operationSchema` with matching `id` and `kind`, valid state/timestamps and a sanitized summary. Reconcile by ID after ambiguous responses. Do not implement the adapter as an unrestricted pass-through to native administration, Ollama or a command runner.

## Private configuration and deployment

On Kinetic, the new peer client uses `AETHER_GATEWAY_ORIGIN`, `AETHER_GATEWAY_SERVER_ID`, `AETHER_GATEWAY_MONITORING_TOKEN`, optional `AETHER_GATEWAY_ADMINISTRATION_TOKEN`, and optional paired `AETHER_GATEWAY_ACCESS_CLIENT_ID`/`AETHER_GATEWAY_ACCESS_CLIENT_SECRET`. Configure the same intended server ID on the API. The origin is a fixed HTTPS root with no credentials, query, fragment or arbitrary path. Without administration credentials, writes must remain unavailable.

The existing main-server client separately uses `MAIN_SERVER_ORIGIN`, `MAIN_SERVER_ID`, `MAIN_SERVER_READ_TOKEN`, `MAIN_SERVER_WRITE_TOKEN` and optional paired `MAIN_SERVER_ACCESS_CLIENT_ID`/`MAIN_SERVER_ACCESS_CLIENT_SECRET`. Do not reuse monitoring, administration, ingestion, identity, Minecraft bridge or unrelated service tokens. `AETHER_ENABLED` controls the existing Discord Aether Core feature; it does not configure the remote playground/trainer.

Store matching API-side values in the approved host secret manager/environment. Keep secrets out of source, public assets, examples, URLs, logs and browser responses. If Cloudflare Access is used, require the exact intended service identity, issuer, audience and environment through validated signed assertions; service-auth headers sent by the bot are not a substitute for server-side JWT verification. Configure least-privilege Access paths for the new endpoints without opening unrelated native APIs. Preserve existing trust and hosting startup settings.

The API session owns actual worker/runtime installation and deployment, model/preset approval, GPU/RAM checks, durable job/dataset/artifact directories, backup and restore, resource quotas and finite retention. Report concrete prerequisites still missing. Do not enable a feature flag merely because its environment variable exists.

## Acceptance evidence required from the API session

1. Strict contract fixtures round-trip with the pinned bot contract. Wrong server IDs, model/preset substitutions, invalid hash/UTF-8 byte counts, malformed/extra fields and unauthorized scopes fail before side effects.
2. Native health/readiness/admission behavior remains compatible; admission's exact payload, stale revision, expiry and replay cases pass. Main-server health uses actual measurements and unsupported operations are absent from capabilities.
3. Sandbox uses an approved model, isolated context, bounded output/deadline and no production tools/memory. Logs contain identifiers/categories, never private prompt/answer bodies or secrets.
4. Durable acceptance survives process restart and lost acknowledgements. Same-ID replay cannot duplicate training, conflicting payloads fail, cancellation-before-submission remains effective, and reconciliation returns the original job identity and hash.
5. Approved snapshots cannot change during a running job. Quotas, concurrent edits, exhausted hardware, unavailable Ollama/trainer, cancellation, retention/erasure and backup restore are exercised.
6. A real small training run completes only after producing a persisted candidate artifact. Its candidate remains separate from the active production model. Report exact supported presets/base models, observed resources and candidate metadata without secrets.
7. Deploy the matching API, configure Kinetic privately, update/restart the bot, then verify website readiness, sandbox, reviewed examples, submit/status/cancel and a controlled candidate through the real gateway chain. Report tests and live verification separately, with exact deployed revisions and unresolved setup. Do not claim live training or activation from local tests alone.
