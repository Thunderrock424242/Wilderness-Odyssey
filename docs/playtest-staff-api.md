# Playtest backend: website handoff

This is source implementation on `bot`, not a deployment or installed-client acceptance report. The unchanged shared client contract is [playtest-diagnostics-contract.md](playtest-diagnostics-contract.md). Runtime schemas are exported from `src/contracts/v1/playtest.ts`. No website branch changes are included.

## Authentication and transport

All staff paths below have prefix `/v1/admin/playtest`. They use the existing `/v1/admin/*` pipeline: signed machine `Cf-Access-Jwt-Assertion`, exact `X-WO-Environment`, and backend-authoritative `X-WO-Admin-Session` in Discord mode. Current dashboard enrollment and Discord Administrator permission are rechecked after request-body reads. `/dashboard enable` remains caller-only and Administrator-only; browser identity/role headers confer no authority. Explicit legacy Access mode retains its signed human identity and staff-assignment checks.

Reads require `reports:read`; writes require `server:write` (Administrator in the existing capability map). Do not expose these routes through an unauthenticated browser proxy. Pages must preserve its current Secure/HttpOnly/SameSite cookies, CSRF token validation, origin/host allowlist and environment separation. CSRF/origin checks belong to that existing browser gateway; a signed backend service assertion is not a browser CSRF check. Forward the session and machine assertion server-side, never into public assets. Protected downloads must use the same gateway authorization, with no public file URL or cache.

Send JSON for writes, at most 64 KiB, with `Idempotency-Key` matching `[A-Za-z0-9_-]{16,100}`. Reasons trim to 10–1000 characters. Revision strings are 1–120 characters; use the current record's revision. A successful retry with the same actor/action/key/body returns the existing operation. Conflicting reuse or stale revisions returns 409. Unknown input/query properties are rejected. No new cookies, environment variables, dependencies, startup command or live command registration are required by this change.

## Staff endpoints

In this table `C` is campaign ID, `T` tester ID, `I` invitation UUID, `U` installation UUID, and `A` artifact UUID. IDs `C`/`T` match `[A-Za-z0-9_-]{1,96}`. All timestamps are UTC ISO-8601 strings. All body fields shown are required. Empty query means no query parameters.

| Method and path | JSON body / query | Success (HTTP 200) |
| --- | --- | --- |
| `POST /campaigns` | `{id:C,title:string(1..100),reason}` | Mutation |
| `GET /campaigns` | `?cursor=decimal-offset` optional | CampaignList |
| `PUT /campaigns/C/collection` | `{revision,enabled:boolean,captureLogs:boolean,captureSpark:boolean,reason}` | Mutation |
| `POST /campaigns/C/testers` | `{testerId:T,discordUserId:decimal-string(17..22),displayName:string(1..100),reason}` | Mutation |
| `GET /campaigns/C/testers` | optional cursor | TesterList |
| `POST /campaigns/C/testers/T/revoke` | `{revision,reason}` of tester | Mutation |
| `POST /campaigns/C/invitations` | `{id:I,testerId:T,revision,expiresInSeconds:integer(60..86400),reason}`; revision is tester's | InvitationIssue |
| `GET /campaigns/C/invitations` | optional cursor | InvitationList (no private codes/hashes) |
| `POST /invitations/I/revoke` | `{revision,reason}` of invitation | Mutation |
| `GET /campaigns/C/testers/T/installations` | optional cursor | InstallationList (no credential/hashes) |
| `POST /installations/U/revoke` | `{campaignId:C,testerId:T,installationId:U,revision,reason}` of installation | Mutation |
| `GET /campaigns/C/testers/T/sessions` | optional cursor | SessionList |
| `GET /campaigns/C/testers/T/artifacts` | optional `cursor`, `sessionId:UUID`, `kind:session\|log\|crash\|spark` | ArtifactList |
| `GET /artifacts/A/download` | empty query | Bounded binary file, authenticated attachment |
| `POST /artifacts/A/delete` | `{revision,reason}` of artifact | Mutation |

Campaign creation starts disabled. Turning on from off generates a fresh collection UUID; turning off immediately rejects uploads and clears the active collection ID. Changing flags while already on preserves the current collection. Neither operation deletes old sessions/reports. Tester creation is an explicit staff approval; the Discord ID entered here is an association selected by authorized staff, never accepted from a client as proof of identity. A revoked tester cannot redeem invitations; approve a fresh tester enrollment ID to readmit them. Installation-only revocation allows recovery with the same tester and a fresh invitation. Revoking an already redeemed invitation does not revoke the resulting installation; use installation/tester revocation for that.

## Exact response shapes

Notation below describes JSON objects, not additional optional fields. `null` is explicit. Lists return at most 50 items, newest inserted first, and `nextCursor` is a decimal offset string or null. Cursor input is 1–7 decimal digits. Heartbeat updates do not reorder installation rows. Follow `nextCursor`; do not silently truncate tester history. Lists contain metadata only, never log text or file bytes.

```ts
type Mutation = {
  schemaVersion: '1.0';
  operation: {
    id: string; kind: string; state: 'succeeded'; summary: string;
    requestedAt: string; updatedAt: string;
  };
};
type InvitationIssue = Mutation & {
  invitation: { id: string; invitation: string; expiresAt: string } | null;
};
type Campaign = {
  id: string; title: string; enabled: boolean; collectionId: string | null;
  captureLogs: boolean; captureSpark: boolean; revision: string;
  createdAt: string; updatedAt: string;
};
type Tester = {
  id: string; campaignId: string; discordUserId: string; displayName: string;
  revision: string; approvedAt: string; revokedAt: string | null;
};
type Invitation = {
  id: string; campaignId: string; testerId: string; expiresAt: string;
  redeemedAt: string | null; revokedAt: string | null; revision: string;
};
type Installation = {
  installationId: string; campaignId: string; testerId: string;
  consentVersion: '1'; enrolledAt: string; lastSeenAt: string | null;
  revokedAt: string | null; revision: string;
};
type Session = {
  id: string; campaignId: string; testerId: string; collectionId: string;
  firstArtifactAt: string; lastArtifactAt: string; observedAt: string | null;
  observedReceivedAt: string | null;
  state: 'recording' | 'ended' | 'interrupted' | 'unknown';
  sparkStatus: 'recording' | 'unavailable' | 'busy' | 'saved' | 'failed' | 'idle' | 'unknown';
  collectionActive: boolean;
  observation: 'waiting' | 'recording' | 'stop requested' | 'stopped' | 'offline' | 'ended' | 'interrupted';
  lastSeenAt: string | null; sparkArtifactCount: number;
};
type Artifact = {
  artifactId: string; campaignId: string; testerId: string; collectionId: string;
  sessionId: string; kind: 'session' | 'log' | 'crash' | 'spark'; scope: 'client';
  capturedAt: string; contentType: 'application/json' | 'text/plain' | 'application/x-spark-sampler';
  receivedAt: string; bytes: number; revision: string; deletedAt: string | null;
};
type CampaignList = { schemaVersion: '1.0'; campaigns: Campaign[]; nextCursor: string | null };
type TesterList = { schemaVersion: '1.0'; testers: Tester[]; nextCursor: string | null };
type InvitationList = { schemaVersion: '1.0'; invitations: Invitation[]; nextCursor: string | null };
type InstallationList = { schemaVersion: '1.0'; installations: Installation[]; nextCursor: string | null };
type SessionList = { schemaVersion: '1.0'; sessions: Session[]; nextCursor: string | null };
type ArtifactList = { schemaVersion: '1.0'; artifacts: Artifact[]; nextCursor: string | null };
```

The invitation code is a random 43-character base64url secret shown only in the first creation response. Its hash is persisted. On an idempotent creation retry `invitation` is **null**, while `operation` is unchanged. The caller-supplied invitation UUID lets the website find and revoke an ambiguously created invitation, then issue a fresh one. Never include codes in list responses, logs, analytics, referrers, public channel messages or a shared ZIP. Deliver privately to the approved tester. The invitation page must supply the public API origin and private code; avoid putting the code into URL query strings or server access logs.

Download responses have `Cache-Control: no-store`, `X-Content-Type-Options: nosniff`, a restrictive sandbox CSP, and `Content-Disposition: attachment; filename="A.sparkprofile"` for Spark, `A.json` for sessions, `A.txt` for log/crash. `Content-Type` is the validated artifact type and `Content-Length` is the stored byte count. There is no remote viewer URL, caller-selected filename/path, URL fetch, proxy, redirect or public object-store destination. Render downloaded text as text, never HTML.

Errors keep the existing `{error:{code:string,message:string}}` envelope. Relevant statuses: 400 invalid input/path/query, 401 missing/invalid authentication, 403 denied scope/permissions/disabled or stale collection, 404 missing resource, 409 revision/idempotency/artifact conflict, 410 expired/revoked enrollment/invitation or explicitly deleted artifact, 413 excessive request/decoded data, 429 throttled/storage quota, 503 unavailable authentication/storage. Messages contain no raw backend exception or secret.

## Enrollment, recovery and display rules

Client paths remain exactly `/api/playtest/v1/enroll`, `/policy`, `/artifacts`. Enrollment requires `consentVersion:'1'` and a single-use invitation; success is 201 with the exact shared response and a random installation credential. Policy/upload use that credential, not dashboard credentials. Tokens are hashed at rest. A missing enrollment acknowledgement returns 409 on retry, never a second enrollment or recoverable token. Staff recovery is:

1. Find the tester's installation UUID and revision through the protected installations list.
2. Revoke that installation (or the whole tester if access should end).
3. Issue a fresh private invitation with a fresh UUID/idempotency key.
4. The tester explicitly enrolls again. The old credential remains unusable.

The policy read updates `lastSeenAt` without claiming that recording began. Its lease is 60 seconds. Disabled policy is exactly `{schemaVersion:'1.0',enabled:false}`. After off/on, old collection IDs remain rejected, including queued retries, and an existing session ID cannot switch installation or collection. Installation last-seen, server receive times, and client-reported capture times are distinct. Never treat a client clock/name/UUID as trusted identity.

For each tester profile, use campaign desired state plus installation heartbeats, session history and the separately filterable artifact list. Show each kind separately and preserve session/collection grouping. `state`/`sparkStatus` are observed client reports, not successful-file acknowledgements; `sparkArtifactCount` counts received undeleted Spark files. A reported `saved` with zero files must show the missing profile. `busy`/`unavailable`/`failed` remain visible. A session created from log/crash/Spark before a session artifact has `unknown` state/status. Never manufacture an end/crash acknowledgement after loss of contact.

`collectionActive` means current desired collection matches the session and installation is not revoked. `observation` preserves explicitly reported ended/interrupted states; otherwise it shows stop requested for a recently seen recording installation when off, stopped when off without that observation, offline after no heartbeat for 60 seconds, recording only with a recent heartbeat and session acknowledgement, or waiting. `observedReceivedAt` is the backend receipt of that session acknowledgement; `observedAt` is its client capture timestamp. Both must be within 60 seconds of backend time before showing recording, so old queued logs and far-skewed client clocks cannot renew recording observations. Nonterminal session observations follow receipt order; terminal ended/interrupted observations cannot be undone by delayed recording updates, and ended takes precedence over interrupted. Immutable files preserve all submitted observations. It is an observation, not proof of client compliance. `upload failed` is appropriate when the website/client actually observes a failed upload; the backend cannot invent it from silence. Old session state remains visible after off without authorizing further uploads.

Later observations in the same terminal state can still update the reported Spark outcome. Terminal state dominance prevents reopening the session, not reporting a later saved/failed profile outcome.

Only `scope:'client'` is accepted here. Existing trusted-server producers/integrations remain separate; server profiles must never be uploaded with an installation credential or attributed to a client. This change adds no server-profile ingestion contract and no inferred time-overlap attachments. Manual `/playtest start`, crash/feedback/Spark-link reports and useful staff receipts remain available as support fallbacks.

## Storage and retention

Private file bytes are BLOBs in `cs_playtest_files`; separate immutable artifact metadata, session projections, campaigns, invitations and enrollments use the existing `cs_records`. Files and metadata commit in the same SQLite transaction with synchronous FULL, so accepted means durable storage, not a queued attempt. Existing SQLite backup/recovery includes both. This avoids filesystem path traversal, orphan-file acknowledgement windows and public file hosting. Production must preserve the existing database on durable private storage.

Requests are capped at 1536 KiB before buffering beyond the bound. Spark is canonical base64, at most 1 MiB decoded; log/crash/session text is at most 256 KiB UTF-8. Nonempty files only. Session content is a JSON object with required `state`/`sparkStatus`; other game/build metadata stays in the private session file and cannot overwrite trusted ownership. The current mod emits `application/json` for session and `text/plain` for log/crash, matching this backend. No shared client contract mismatch was found in the inspected source.

Storage accepts at most 512 MiB of live files globally, 64 MiB per campaign/tester, and 100,000 artifact IDs including deletion tombstones. Quota exhaustion rejects with 429; existing reports are retained. Stable IDs deduplicate identical bodies and reject conflicts. Explicit deletion removes the BLOB and retains a metadata tombstone to reject resurrection; off/revoke/restart never deletes old reports. Historical backups/WAL retention are part of the operator's existing private database lifecycle; logical deletion is not a claim that every historical backup was erased.

## Evidence and outstanding acceptance

`test/playtest-diagnostics.test.ts` exercises real HTTP handlers and SQLite storage, including enrollment races, consent, expiry/reuse, disabled campaigns, installation recovery, cross-scope/stale/revoked uploads, body bounds, deduplication/conflicts, rollback, private downloads/deletion, session trust and persistent reopen. It substitutes only the external legacy identity provider; `test/dashboard-http.test.ts` separately exercises the new staff paths with signed machine assertions and real dashboard session/authorization code. `test/playtest-invitations-command.test.ts` simulates private Discord replies for unlinked testers. The existing suite also validates command registration payloads without contacting the live registration API.

These tests do not certify live Discord, Kinetic persistence/proxy configuration, Pages browser CSRF/origin behavior, invitation-page delivery, installed Minecraft collection, Spark format compatibility, overhead, redaction, local-stop races or client lease expiry. Those require separately authorized integration acceptance from the shared contract. No telemetry was observed or invented, and nothing was deployed or registered live.

Local validation completed with Node v24.13.1: `npm run check`, `npm test` (114 passed, zero failed), and `npm run build`. The compiled diagnostics modules also loaded directly from `dist` without a development loader. No dependencies or production startup settings changed; the implementation uses existing Node 22-compatible crypto/SQLite APIs. The deployed Node 22 host was not exercised. The copied shared contract has SHA-256 `38f4d0a7bfcb393334845577e8161451c1c57fa5dc055278a7510c2c77225c07`, identical to the API checkout at inspection.
