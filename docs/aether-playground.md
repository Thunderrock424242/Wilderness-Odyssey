# Aether playground setup and use

The website's `/admin/aether-playground/` connects enrolled Discord administrators to a separately hosted Aether service through Pages, the bot gateway and the trusted bot. The bot stores private reviewed examples and training request history. The API/Aether server runs inference and training. Installing the website or enabling the bot's existing `AETHER_ENABLED` feature does not install a trainer.

Use [the server Codex handoff](aether-server-codex-handoff.md) in the existing `Wilderness-Odyssey-API` `in-dev` session. It contains a copyable message, the exact peer routes, security and persistence requirements, native admission compatibility, the separate main-server adapter and acceptance checks. The [shared contract](../src/contracts/v1/aether-playground.ts) at the deployed bot revision is authoritative.

## Three different operations

| Operation | What it does | What it does not do |
| --- | --- | --- |
| Sandbox test | Runs a bounded conversation against an approved model in an isolated context | Does not save production player memory or train a model automatically |
| Training job | Uses an immutable snapshot of explicitly approved examples with a server-approved base model and preset | Does not automatically activate its candidate model |
| Production activation | Changes the active model through a separately implemented and reviewed operation | Is not included in completing a playground training job |

Sandbox output is ephemeral unless staff explicitly saves an example. Examples can contain a prompt, observed response, expected response, notes and an evaluation. Review each example before approving it. Editing an example must require another review; train only from the revisions deliberately selected for that job. Submit only material you have permission to use. The playground does not automatically collect Discord messages or production player conversations.

## Configure the real services

Deploy the updated bot backend on Kinetic, the matching website gateway Worker and the website. Separately implement/deploy the API endpoints in the handoff. Keep the existing bot database and startup settings. Record the exact revisions on both sides so their contracts can be compared.

Set these private Kinetic environment values:

| Name | Purpose |
| --- | --- |
| `AETHER_GATEWAY_ORIGIN` | Fixed HTTPS root of the intended API/Aether service |
| `AETHER_GATEWAY_SERVER_ID` | Exact identity returned by that service's capabilities handshake |
| `AETHER_GATEWAY_MONITORING_TOKEN` | Dedicated read/monitoring credential, at least 32 characters |
| `AETHER_GATEWAY_ADMINISTRATION_TOKEN` | Different private credential for sandbox, admission changes and training administration; omit to keep writes unavailable |
| `AETHER_GATEWAY_ACCESS_CLIENT_ID` and `AETHER_GATEWAY_ACCESS_CLIENT_SECRET` | Supply together when Cloudflare Access protects this peer |

Configure the corresponding scoped credentials and server identity on the API host through its approved secret store. Never place these values in the website, browser storage, Minecraft mod, GitHub source or a chat message. A configured token does not prove a service is reachable, authorized or capable of training.

The server-management panel's existing main-server integration is separate. It uses `MAIN_SERVER_ORIGIN`, `MAIN_SERVER_ID`, `MAIN_SERVER_READ_TOKEN`, `MAIN_SERVER_WRITE_TOKEN` and, if required, the paired `MAIN_SERVER_ACCESS_CLIENT_ID`/`MAIN_SERVER_ACCESS_CLIENT_SECRET`. Its `/v1/service/*` adapter must actually exist. Native Aether `/health` and `/v1/admin/admission` do not supply Minecraft telemetry or that adapter automatically.

The API host must provide approved models and training presets, a real model/training runtime, resource admission, durable job/dataset/artifact storage, backups, finite retention and a restore procedure. Keep monitoring and administration credentials distinct from each other and other service scopes. Access-protected deployments must validate the exact signed service identity/audience/environment server-side.

## Verify readiness before use

The page reports connection, verified server identity, inference/admission and training support separately. Missing routes, mismatched identity, unreachable dependencies or absent configuration mean setup is required or the service is unavailable. The native health endpoint does not identify the server; the new capabilities handshake must match `AETHER_GATEWAY_SERVER_ID` before writes.

Start with a bounded sandbox call against an approved model. Save an example deliberately, review its prompt and target, and approve it. Select the approved revisions, approved base model and preset; acknowledge the resource cost and supply a reason before submitting a training job. The server must accept it durably and return its real status quickly while a worker runs the training.

A timeout can mean the server accepted a request but its acknowledgement was lost. Reconcile the existing request/job instead of creating another job. Cancellation is a server operation and may show `cancel-requested` before it is confirmed. A completed job must identify an actual candidate artifact. It does not mean that candidate is active in production.

Changing the configured origin, credentials or server ID can leave old jobs marked as belonging to a changed connection. Restore the intended connection or investigate its original server; never redirect an old job to a different server merely to clear its status.

## Privacy and remaining setup

Examples, snapshots and job history belong in private persistent storage with quotas and documented retention/deletion. Prompt, response and dataset contents must not appear in application logs or public status. The API session owns candidate artifact storage, hardware limits and deployment; the bot owns its private example/request records. Backup retention and deletion must cover both services.

Bot examples expire thirty days after their last save/review, are limited to 500 live records and 8 MiB, and are paged ten at a time. Known credential patterns are masked before saving; review the saved text before approval. At most five unresolved training requests are retained alongside bounded recent history; active requests are listed first. Terminal history expires after thirty days using the bot's receipt clock, not a peer-supplied timestamp. Sandbox output and training dataset bodies are not persisted in bot request history. Accepted server-side snapshots and candidate artifacts have their own retention: deleting a local example does not erase a dataset already accepted by the trainer.

Local compiler, unit, browser or Worker checks verify code behavior. They do not prove Kinetic is running the latest bot, the API endpoint is implemented, GPU/RAM is available, a trainer is installed, or a model was trained. Completion requires the exact API-side implementation, private host configuration, matching deployments and real end-to-end acceptance described in the handoff. Production activation remains a separate reviewed action.
