# Aether administration and training playground

## Scope

Implement the website and Discord-bot backend side of the Aether integration. The owner selected both sandbox conversations/reviewed examples and real server-side training jobs. Prepare an exact implementation message and shared contract for the separate Wilderness-Odyssey-API/Aether Codex session. Do not modify or deploy that repository or a model from this task.

## Architecture

The browser calls authenticated, same-origin Pages APIs. Pages calls the bot through the existing machine-authenticated gateway. The bot calls an explicitly configured Aether service with separate monitoring and administration credentials and optional Cloudflare service credentials. Browser requests cannot select upstream URLs or supply service secrets.

Preserve the existing main-server `/v1/service/*` client. Add the optional Cloudflare service-auth headers it needs, and document the exact matching main-server adapter the other repository must implement. Add a focused Aether client for the existing `/health`, `/ready`, and `/v1/admin/admission` routes; determine their current schemas from actual Java source. Unsupported main-server controls remain unavailable until their peer endpoints exist.

The new playground/training route family uses a versioned contract shared between website and bot. Its feature handshake pins the expected server ID and reports supported operations, approved model IDs, training presets, and server resource/setup readiness. Missing routes or missing configuration mean setup required, not a successful operation.

## Admin experience

Add an Aether playground entry in staff navigation and owner documentation. Show connection, inference, administration and training readiness separately. Expose existing Aether pause/resume only through its actual authenticated admission contract.

Sandbox conversations use a selected approved model and bounded conversation context. Results remain ephemeral unless staff explicitly saves a training example. They do not use production player memory or automatically ingest Discord/player conversations.

Staff can create/edit/delete examples, record an expected response and evaluation, and explicitly approve or reject each example. Training accepts an immutable snapshot of approved examples only. Display example counts and review state clearly.

Staff can submit a training job using an approved base model, a server-approved preset, the reviewed snapshot, an explicit acknowledgement and reason. Show genuine queued/running/completed/failed/cancelled status from the server, allow cancellation where the peer supports it, and retain private request/job history. If acceptance is uncertain after a timeout, reconcile using the original request ID; do not blindly submit another job.

Training is not model activation. Completed jobs produce candidate model identifiers/artifact metadata. This iteration does not automatically activate, download, pull, delete or replace the production model.

## Permissions, privacy and reliability

Only enrolled Discord administrators receive the new playground read/write/train capabilities. The trusted bot checks the active session and capability on every request and freshly verifies Discord permission for mutations and expensive calls. CSRF, same-origin intent, revision checks, bounded request/response sizes, idempotency and private no-store responses apply through every gateway.

Keep examples and job records in private persistent storage with quotas, retention and deletion. Never log prompt/response/example text, authorization headers or service credentials. Do not collect production conversations automatically. Make explicit that staff must have permission to use the examples they submit.

Training resource limits and allowed presets come from the server. No arbitrary shell commands, trainer Python, filesystem paths, model-download URLs or unrestricted Ollama proxy are exposed. Requests and jobs are pinned to their original server and destination; changing configuration must not silently retarget an old job.

## Server handoff

Deliver a copyable Codex message plus an exact contract file covering configuration, machine trust, existing Aether endpoint compatibility, missing main-server adapter routes, sandbox generation, supported capabilities, approved-example snapshots, durable idempotent training jobs, cancellation/reconciliation, bounded storage, audit privacy, model activation separation, tests and deployment acceptance.

The server Codex owns the training worker, actual trainer choice, GPU/RAM checks, approved base models, Ollama/model runtime, Minecraft integration, service deployment and activation. This task delivers no claim of live training until those dependencies are implemented, configured and tested.

## Acceptance

Compiler/build, bot tests under Node 22, website gateway/unit/browser tests and a compiled Worker smoke check pass. Test permissions, unsupported/missing peers, incorrect server identity, timeouts/ambiguous writes, rejected/unreviewed examples, immutable snapshots, concurrent edits and privacy. Push bot/website branches and deploy their existing gateway/website pipeline under the session's authorization. Report Kinetic deployment/configuration and Aether-side work as explicit remaining steps.
