# Invited playtest staff adapter v1

**Integration status: backend implementation required.** This website implements a private staff adapter, not invitation storage or client ingestion. No invited-diagnostics staff endpoints were found in the inspected local bot branch/settings checkout on 2026-10-25. Test fixtures live only under `tests/`. The deployed dashboard must remain unavailable until the backend implements this contract and grants the dedicated capabilities. No deployments are part of this change.

The client transport contract is `Wilderness-Odyssey-API/docs/playtest-diagnostics-contract.md` (`POST /api/playtest/v1/enroll`, `GET /api/playtest/v1/policy`, `POST /api/playtest/v1/artifacts`). Do not replace it with the older Discord `/playtest` session/ownership-verification workflow. Client-reported names/UUIDs are unverified labels, never authority. Routine collection and uploading must work without Discord interactions or technical commands.

## Staff transport and ownership

Exact request/response schemas: `contracts/v1/playtests.ts`. Exact routes: `contracts/v1/playtest-routes.ts`. Machine-readable export: `npm run contracts:export` → `contracts/v1/schemas.json`, `playtests` section. These are a proposed backend adapter contract until the backend owner implements and accepts them.

Browser prefix `/api/admin/v1`; backend prefix `/v1/admin`. Every endpoint requires the existing machine Access credentials plus opaque staff session/assertion supplied by the Pages gateway. Recheck bot enrollment and current effective configured-guild Discord Administrator permission for every request. Session absolute expiry and caller-only `/dashboard enable` behavior remain unchanged. Grant `playtests:read` / `playtests:write` explicitly; other staff roles receive neither. An unknown capability or missing endpoint must not fall back to sample data.

All mutations require same-origin JSON, CSRF and a 16–100 character idempotency key. Reject unknown fields. Every existing-record mutation includes its opaque revision. Apply revision comparison and durable mutation atomically. Replay identical request keys/body/actor results, reject conflicting reuse, and check current authority on replay. The browser retains an ambiguous request key in memory for an exact retry and never automatically retries. A staff refresh discards in-memory keys and reloads authoritative revisions. Invitation creation needs durable idempotent replay of the once-returned code, with secure short-lived replay storage; ambiguous success must never silently create a second enrollment or invite.

| Method | Path after prefix | Output / meaning |
| --- | --- | --- |
| GET | `/playtests?cursor=` | Up to 50 campaigns and opaque next cursor |
| POST | `/playtests` | Create title/build/retentionDays; collection **off** initially |
| GET | `/playtests/:campaignId?cursor=` | Campaign and up to 50 enrolled tester summaries |
| PUT | `/playtests/:campaignId/collection` | Atomically apply `collect` and return new campaign revision |
| POST | `/playtests/:campaignId/invitations` | Single-use private invitation for tester label/build; expiry 1–168 hours; return code once |
| GET | `/playtests/testers/:testerId/history?cursor=` | Up to 50 campaign/build groups with sessions; stable tester identity across campaigns |
| GET | `/playtests/:campaignId/testers/:testerId?cursor=` | One campaign/tester group, up to 50 sessions |
| PUT | `/playtests/:campaignId/testers/:testerId/permission` | `allowed`, `paused`, or terminal `revoked`; return updated tester revision |
| DELETE | `/playtests/:campaignId/testers/:testerId/data` | Explicit `confirmDelete: true`, revision checked; confirm only after durable deletion |
| PUT | `/playtests/:campaignId/testers/:testerId/sessions/:sessionId/notes` | Private staff notes and session revision |
| GET | `/playtests/:campaignId/testers/:testerId/sessions/:sessionId/artifacts/:artifactId` | Bounded private client artifact envelope |
| GET | `/playtests/:campaignId/testers/:testerId/sessions/:sessionId/server-profiles/:artifactId` | Trusted server Spark envelope, attached only by overlapping capture times |

GETs accept only an optional opaque cursor, no duplicate query fields. Cursors must bind the actor and full collection/profile path; do not let a cursor cross testers. Return stable chronological history without mixing sessions. Each group contains at most 50 sessions, each with at most 100 artifact summaries and 20 shared server profiles. For oversized histories, paginate groups/session slices using the outer cursor and repeat campaign metadata as needed. No truncation masquerading as a complete history.

Every returned session and artifact must match the campaign/tester/session/artifact IDs in its requested path. Backend enforce ownership from stored relationships, never caller-supplied labels. The gateway independently rejects mismatched response projections and rechecks staff authorization after reading private data. Do not return upstream URLs, raw error messages, secrets, installation credentials, authorization headers or unredacted reports. Unknown response fields are stripped by the schemas.

Responses use JSON and `schemaVersion: "1.0"`. Maximum artifact envelope is 1536 KiB; text 256 KiB UTF-8; Spark 1 MiB decoded, strict base64. Only redacted text (`redacted: true`, `text/plain`, `utf8`) can be viewed. Spark uses `application/x-spark-sampler`, `base64` and original bytes. Gateway-only `/download` suffix returns validated bytes with attachment disposition, a generated safe filename, `no-store`, `nosniff` and sandbox CSP. No storage redirects or third-party viewer uploads. Client and shared-server scopes use separate routes and headings.

Diagnostic campaign/tester/session/artifact IDs and collection IDs accept 1–100 ASCII letters, digits, underscores or hyphens, matching the client bounds. These diagnostic limits are separate from older administration IDs. The client uploads `session` artifacts as `application/json`; the backend parses bounded validated metadata into the staff session projection. If a session artifact is requested as a file, redact it and normalize it to plain-text JSON (`text/plain`, `utf8`, `redacted: true`) without evaluating or rendering it as HTML. Preserve the original immutable artifact separately.

## Collection and observed state

Collection permission is desired state. On every off/on cycle issue a fresh `collectionId`, invalidate the old collection atomically, and reject all subsequent old/disabled uploads immediately. Off or per-tester pause/revoke does not delete existing data. Clients cannot renew authorization past their maximum 60-second lease. Revoked enrollments cannot become allowed again; use a fresh invitation and consent. A policy read updates last seen only; it cannot create a recording acknowledgement.

`campaign.collectionId` identifies the campaign generation; `tester.collectionId` is the effective installation generation delivered by the client policy endpoint. It may differ between testers. Every per-tester pause→allow transition must rotate the effective installation generation and reject all artifacts carrying its previous value, including retries queued before the pause. Campaign off/on invalidates every effective installation generation. Staff Recording requires an acknowledgement matching **tester.collectionId**, not merely the campaign generation or a new server receipt timestamp. Without a current effective generation, display Waiting for game. This fence requires backend/client integration acceptance; a campaign-only collection ID is insufficient for per-tester resume.

Tester acknowledgement is derived from a committed `session` artifact, using server receipt time as `observedAt` and the active collection ID. `changedAt` is server time for campaign desired-state changes / tester permission changes. A recording acknowledgement must be at or after both change times, match the current collection ID and have a heartbeat within 60 seconds. A current heartbeat without that proof means **Waiting for game**. More than 60 seconds without heartbeat means **Offline/connection lost**. A newer failed upload observation than last successful upload means **Upload failed**. Include last-seen and last-upload times separately; never fabricate upload errors the backend cannot observe.

When disabled, show **Stop requested** until an ended/interrupted acknowledgement after the change or the maximum lease has elapsed, then **Stopped** (authorization ended, not proof of a final report). A never-seen installation is already stopped when off. The website recomputes age locally from the last snapshot and labels its refresh time. Staff can refresh for new observations. Client acknowledgement is never inferred from a queued switch response, policy fetch or missing Spark artifact. Clock synchronization is required between trusted service timestamps and the browser.

Session metadata includes captured start/end, duration, build, single-player/multiplayer/unknown mode, client-observed state, Spark status, dropped artifacts, upload errors, staff notes and revision. A hard crash can leave an interrupted record without a final log/profile. Do not assert Spark installation from absence: unavailable, busy, idle, failed and saved are separate states. When `sparkStatus=saved`, the backend must include its committed Spark artifact summary; interrupted sessions can have partial reports.

Session `build` is the staff-assigned build bound to the invitation/campaign. The client's `modVersion` is projected separately as optional `reportedModVersion`; it does not prove the installed pack matches the assigned build. Obtain dropped counts from committed client metadata. Session `uploadErrors` and dropped counts are nullable when unobserved and display **Not reported**, never an invented zero. The current client metadata does not report an upload-error counter, so use null unless a separately defined, scoped source supplies it. Likewise, `uploadErrorAt` can represent only a failure the backend actually observed; it cannot detect a disconnected client's failed HTTP attempt.

## Invitations, local consent, retention and recovery

Backend creates an expiring cryptographically random private code (at least 32 characters), hashes it at rest and atomically redeems it for one installation. Invitation input may include an existing `testerId` selected by authorized staff to keep that person's history together across campaigns; without it, create a new tester profile. Never merge profiles based on a matching name, reported Minecraft identity or installation-supplied testerId. The website offers existing testers from campaigns opened during the current signed-in visit; a staff refresh clears that private list.

Existing-profile choices show the tester label, playtest context and stable profile identifier so identical display names remain distinguishable. The identifier is selected by staff; routine testers never type it or a session ID.

Allow at most one active installation enrollment per tester/campaign. A replacement requires explicit revocation and a fresh invitation; preserve the earlier sessions under that tester's history. Reject ambiguous concurrent replacement rather than silently assigning two installations to a single observed-state summary.

The backend supplies only the deliberately public HTTPS ingestion origin. Enrollment retries use the same installationId; provide a recovery path for ambiguous redemption. Staff shares `/playtest/#invitation=...&api=...` privately. The website removes the fragment immediately, never sends it to a server, saves it in storage or redeems it. The code is copied into the client's **Playtest** screen, where the tester reads the notice and explicitly accepts collection; installation credentials stay in the client. No Minecraft ownership check is required.

Downloads and normal startup must not depend on having an invitation or the not-yet-released gated build. Publish/distribute the diagnostics-enabled client/bootstrap separately when available; the website does not claim a public build exists. Manual support remains available if Minecraft cannot launch. If a code expires or its redemption result is uncertain, contact staff for recovery rather than retrying with different installation identities.

Enforce campaign retentionDays (1–90) on the backend and remove expired objects, indexes and notes. Explicit per-tester/campaign deletion removes retained client artifacts, sessions and notes, with auditable completion; it does not change collection permission or remove a shared server profile belonging to multiple testers. Provide the backend's separate server-profile retention policy. A tester can locally **Stop and leave** to withdraw consent, discard pending artifacts and clear their local credential. This does not delete retained backend reports; staff must honor a deletion request using the explicit action.

## Acceptance boundary

Read-only coordination with the bot owner confirmed the staff and ingestion routes are absent. Backend implementation must extend its capability/session schemas, read revision-bearing DELETE JSON bodies, provide a separate 1536 KiB bounded artifact parser, and use its existing transaction/audit owner for invitations, deduplication, revisions and retained storage. Ordinary 64 KiB bot request handling cannot accept client artifacts.

The reviewed client currently generates a new installation UUID on each enrollment invocation, despite the transport contract requiring a stable pending installationId through ambiguous retries. Persist that pending identity and implement recovery in the client/backend before live enrollment. This website change does not modify the mod checkout or claim that recovery has been fixed.

Website unit/browser fixtures verify the adapter, authorization barriers, UI state, text handling and download projection. They cannot certify durable storage, invitation atomicity, backend redaction, off enforcement, client lease behavior, installed Spark or live Discord. Before release run two real invitations/installations across single-player and multiplayer; test duplicate/cross-profile uploads, revoke/off mid-capture, stale client completions, outage/restart, lease expiry, interrupted launch recovery, consent withdrawal, busy/absent Spark, oversized artifacts, retention and explicit deletion. Deploy backend first, then enable staff capabilities after contract checks, then validate Pages and live clients under the existing protected deployment process.

## Local website evidence, 2026-10-26

- `npm run verify`: passed with 139 unit tests, no TypeScript errors, production build/Pages worker compilation, browser-bundle secret-boundary checks and generated-site link checks.
- `npm run test:e2e -- --workers=2 --output=<task evidence folder>`: 74 browser tests passed against production static preview and Pages runtime. Desktop/mobile screenshots inspected; keyboard and axe checks passed for the dashboard and invitation guide. Fixture evidence is separate from live service/client acceptance.
- New website paths are `/admin/playtests/` and `/playtest/`. The invitation page adds a strict same-origin script CSP, no-store and no-referrer headers; its script remains external so Pages CSP permits fragment clearing. Existing root paths and legacy redirects passed the runtime checks.
- The pre-existing production dependency audit still reports 1 critical and 3 high findings; this change does not alter dependencies. No deployment or bot-branch modifications were performed.
