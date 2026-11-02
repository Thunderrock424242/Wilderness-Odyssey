# Invited website playtester homes

This feature is source code until both branches and the gateway Worker are deployed. Existing `/playtest` releases and game diagnostic enrollment are preserved.

## Deployment

1. Back up the existing SQLite database using `npm run connected:operator -- backup --database <existing-path> --output <new-backup-path>` and preserve `DATABASE_PATH`. Never replace the database on reinstall.
2. Deploy this bot source and run `npm ci`, `npm run check`, `npm test`, `npm run build`. Keep Node 22, Main File `index.js`, existing launcher and environment variables. No new secrets or OAuth redirect are needed; participant OAuth uses the already registered `/api/auth/discord/callback` but separate browser flow/session cookies and separate backend tables.
3. Register the added `/playtester` command through `npm run deploy`, using the bot's existing private environment, and restart the bot through normal hosting controls.
4. Deploy the matching website branch and gateway Worker route/schema/header updates. Machine Access stays on `/v1/admin/*`; tester browser paths `/playtester/*` and `/api/participant/*` must not be covered by the administrator email Access application. Preview Access protection stays enabled.
5. Sign in with two real Discord accounts: invited tester and administrator. Prove wrong-account claims, expired links, revoked membership, blocked DMs, logout, and private stats. Live user authentication is performed by the account owner. Local tests do not prove production activation.

## Staff usage

- `/playtester create campaign:alpha title:Alpha expedition` creates a diagnostic campaign with collection off. It does not publish a build or enable recording.
- `/playtester invite account:@person campaign:alpha` uses Discord's account picker, verifies current Administrator permission and target guild membership, and sends a 24-hour claim link by DM. A blocked or uncertain DM returns a private account-bound fallback link. Never publish it in a channel.
- `/playtester revoke account:@person campaign:alpha` revokes website membership and pending claims for that account and campaign. Installation credentials and diagnostic collection are managed separately.
- Website `/admin/playtester-access/` lets enrolled administrators invite by Discord ID, revoke membership, and save tester-facing instructions, announcements and tasks. Use actual existing campaign IDs. Existing `/dashboard enable` remains the admin enrollment step.

The recipient signs in with **Playtester sign-in**, then reopens their DM link and explicitly claims it. We do not send passwords or collect Discord passwords. Links store token digests only. If a response is lost, the same invitation request key returns a conflict rather than reconstructing/reissuing a secret; use a fresh request to send a new account-bound invitation. Claiming the same link again is safe while that membership remains active.

## Data and privacy

Participant storage is pinned to the configured Discord guild. Changing GUILD_ID requires an explicit database migration; old memberships cannot silently move to a new guild. Tester OAuth sessions last 15 minutes and are stored as digests in separate tables. Administrator routes never accept them.

History derives tester ownership from trusted `pt_tester.discordUserId` records and active claimed campaign membership. It omits staff notes, diagnostic files, credentials and other tester records. Revocation is checked on every read. Pagination returns 25 sessions; aggregate statistics cover all authorized sessions, independently of the current history page.

`pt_session_metadata` stores a safe projection of new game session reports: valid `startedAt`, optional build, and terminal `durationSeconds` or a valid `endedAt` difference. Missing/invalid timing remains unavailable. Recording time is not guessed from artifact receipt or website login. Overlapping known intervals count once in aggregate totals. Older reports without this projection remain unavailable. Client-reported durations are descriptive, not proof of gameplay or a basis for rewards or authorization.

Website claims do not enable game diagnostics or automatically redeem installation invitation codes. The existing explicit in-game notice, consent, local Stop and leave, and installation enrollment remain unchanged.

## API

All backend participant endpoints remain beneath the authenticated machine prefix `/v1/admin/participant/`:

| Operation | Method | Credential |
| --- | --- | --- |
| start, callback | POST | Signed machine Access plus bound OAuth flow |
| session, home, history | GET | Machine plus `X-WO-Participant-Session` |
| claim, logout | POST | Machine plus participant session |

History accepts only an optional numeric cursor. Other queries are rejected. Staff-only `/v1/admin/participant-staff/invite`, `/revoke`, `/content` use the existing admin session and idempotency header. Pages verifies host/origin, CSRF, schema and account scope and returns no-store responses. Worker routes, method/schema allowlists and session header forwarding must match the website source.

## Rollback

Roll back the website and Worker together, then the bot if needed. Keep additive participant tables and existing database; do not drop data. Restore a backup only through an explicit operator recovery procedure. Existing administrator authentication and existing game enrollment remain separate.
