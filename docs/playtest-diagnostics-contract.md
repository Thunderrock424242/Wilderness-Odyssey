# Invited playtest diagnostics API v1

This is the shared implementation contract for the Minecraft mod, bot backend and hosted website. Backend/website delivery is separate work; the client must remain disabled until invitation redemption succeeds and the tester accepts collection. No Minecraft ownership verification is required. Names/UUIDs reported by clients are labels, never authorization.

## Transport and enrollment

Fixed paths below are relative to an operator-configured HTTPS origin (no path/query/userinfo/fragment). Literal loopback HTTP is accepted only for local development. No redirects. JSON responses at most 16 KiB; 5-second request deadline. Never log bodies, invitations or bearer tokens.

`POST /api/playtest/v1/enroll` (no bearer):

```json
{"schemaVersion":"1.0","installationId":"client-generated UUID","invitation":"single-use private code","consentVersion":"1"}
```

Success (200/201):

```json
{"schemaVersion":"1.0","testerId":"tester-1","campaignId":"campaign-1","accessToken":"installation-scoped random credential at least 32 characters"}
```

The backend redeems the invitation atomically, scopes the token to that tester/campaign/installation, hashes it at rest, and returns it once. Enrollment retries use the same installationId; ambiguous success must have an explicit recovery path rather than duplicate enrollment. The mod stores its credential locally, never in SERVER config. Invite page supplies the public API origin and invitation; a shared production pack must contain neither invitations nor credentials.

## Policy / heartbeat

`GET /api/playtest/v1/policy`, `Authorization: Bearer <installation credential>`.

```json
{"schemaVersion":"1.0","enabled":true,"campaignId":"campaign-1","testerId":"tester-1","collectionId":"collection-1","captureLogs":true,"captureSpark":true,"leaseSeconds":60}
```

Off: `{"schemaVersion":"1.0","enabled":false}`. Poll every 10 seconds, including menus after enrollment. Backend uses this read as installation last-seen, not recording acknowledgement. Every off/on cycle must issue a fresh `collectionId` (1–100 ASCII letters/digits/underscore/hyphen). Artifacts/recovery are accepted only for the currently active collectionId, so an offline client cannot later upload old data after collection is reenabled. No arbitrary client actions or URLs in policy. Lease is a duration from receipt measured against a monotonic client clock; capped at 60 seconds. Policy must never authorize a different tester or campaign than enrollment. 401/403/410 revoke local authorization and discard pending diagnostic data; timeouts/5xx cannot renew a lease. On off, discard pending data and cancel only our sampler. Local stop withdraws consent, clears the credential/pending artifacts and invalidates in-flight results; reenrollment requires a fresh explicit action.

## Separate immutable artifacts

`POST /api/playtest/v1/artifacts`, same bearer header:

```json
{"schemaVersion":"1.0","artifactId":"UUID","campaignId":"campaign-1","testerId":"tester-1","collectionId":"collection-1","sessionId":"UUID","kind":"log","scope":"client","capturedAt":"ISO-8601 UTC","contentType":"text/plain","encoding":"utf8","content":"redacted current-session log segment"}
```

Kinds are `session`, `log`, `crash`, `spark`. Store and display each kind separately under tester → campaign → session. `session` contains a JSON string with start/end/status, build/version and reported game metadata. `spark` uses `application/x-spark-sampler`, `encoding=base64`, content at most 1 MiB decoded; preserve/download actual `.sparkprofile`, not a fabricated viewer URL. `log`/`crash` are UTF-8 text at most 256 KiB. Total request at most 1536 KiB. No HTML rendering of logs. Report/artifact data is private staff information with explicit retention/deletion controls, never public page content.

Success only after durable commit: `{"schemaVersion":"1.0","accepted":true,"artifactId":"same UUID"}`. Repeated same ID/body is idempotent. Reject conflicting reuse. Authenticate every request; enforce current enrollment/collection permission and campaign/tester ownership on upload, including queued retries. Never derive authority from supplied testerId, UUID or name. Off must reject new uploads immediately even if a client's lease has not expired. 401/403/410 trigger discard, 429/5xx/network failures retain bounded queue while authorized. Do not follow caller-provided storage URLs. Reject excessive bodies before buffering; validate base64 decoded length.

Client queue: 16 artifacts / 8 MiB persisted, oldest dropped on overflow with visible count; stable IDs survive retry. Single installation I/O worker and independent lease watchdog, bounded parsing/file sizes. Normal disconnect ends a session, later connections start fresh sessions. Interrupted recovery is marked explicitly and offered only after the same campaign/tester/collection is currently enabled. It uses our already-redacted saved session tail, not a sweep of crash directories or the next launch's overwritten latest.log. A hard crash cannot guarantee a final crash log or Spark profile. No permanently running companion process.

## Acknowledgements / dashboard state

`session` artifacts supply `state` (`recording`, `ended`, `interrupted`) and `sparkStatus` (`recording`, `unavailable`, `busy`, `saved`, `failed`, `idle`). Client state is observed; admin switch is desired state. Report `waiting`, `recording`, `stop requested`, `stopped`, `offline`, `upload failed` without inventing successful recordings. Off is authoritative even with no final acknowledgement. Show last heartbeat and artifact timestamps, never access tokens. Shared server profiles must have scope `server` through a separate trusted server producer and attach by overlapping capture times, never be mislabeled as an individual client profile.

## Integration acceptance

Use two invitations/installations; verify redemption, consent, single-player and multiplayer, per-profile separation, duplicate uploads, denied cross-profile writes, policy off mid-capture, stale response after local stop, lease expiry, backend outage/restart, normal quit and interrupted launch recovery, absent/busy Spark, oversized files and redaction. Code/unit tests do not certify installed-client behavior, external deployment or measured overhead.
