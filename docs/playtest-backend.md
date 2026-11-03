# Website playtest backend

The bot implements the website's plural `/v1/admin/playtests` API over the same SQLite records used by the installation client. The older singular `/playtest` staff API remains available. Administrators receive `playtests:read` and `playtests:write`; requests still require signed gateway identity and a valid staff session.

Campaign creation, build and retention metadata, collection controls, Discord-associated testers, client invitations, tester permission changes, histories, private client artifacts, session notes and scoped data deletion are implemented. Unreported session timing, mode, upload errors and Spark status remain unknown. Server profiles are not invented; their routes return 404 until a real server-profile source is connected.

## Production setup

1. Preserve the bot database and environment, update Kinetic from the `bot` branch and build/restart using its existing startup configuration.
2. Set `PLAYTEST_PUBLIC_API_ORIGIN=https://wilderness-odyssey-bot-gateway.thunderrock-labs.workers.dev` on Kinetic. Keep the existing connected-services, administrator and Discord OAuth configuration.
3. Deploy the gateway from the `website` branch. It permits exactly `POST /api/playtest/v1/enroll`, `GET /api/playtest/v1/policy` and `POST /api/playtest/v1/artifacts`. Enrollment uses a single-use private invitation; policy/uploads require an installation bearer credential. Responses are never cached. Staff and browser credentials are never forwarded on these routes.
4. Deploy the website branch. Create a campaign with the intended build and retention period, enable collection, and create a private client invitation using the recipient's Discord user ID. A Discord server membership check is not needed for testers.
5. Test the invitation with the diagnostics-enabled game client: explicit local consent and enrollment, policy acknowledgement, a session/log upload, pause and resume, and a private download. The client is a separate deliverable; these API changes do not install or enable diagnostics inside Minecraft.

The Playtester website access page issues account-bound website invitations and optional Discord DMs. Client enrollment invitations authorize diagnostic installation enrollment; website membership and private inbox access remain separate. Share client invitation links privately. Issuing one does not prove that the game has started recording.

## Session behavior

Active administrator sessions last fifteen minutes without sliding extension. Navigation and ordinary reads check the stored token, expiry, active enrollment and enrollment generation locally. They do not perform another Discord REST verification. Administrative mutations, sensitive artifact reads and queued operations still verify current Discord permission; confirmed permission loss revokes sessions. `/dashboard disable` and sign-out revoke immediately. Remembered sign-in renews access automatically for up to seven days, including while the staff panel remains open, with a fresh Discord check at renewal.

## Data handling

Pausing stops policy and uploads immediately; resuming uses a new collection ID. Revocation invalidates installations and outstanding invitations. Deleting tester data revokes collection and deletes artifacts, notes and session metadata transactionally, retaining payload-free request tombstones for the bounded idempotency window so an old request cannot restore it.

Retention uses trusted receipt timestamps. Expired artifacts and sessions are hidden on reads and removed by hourly cleanup; startup performs catch-up cleanup. Deleted artifact metadata is retained for at most thirty additional days to reject late duplicate uploads and does not consume the live artifact quota. Text downloads apply the existing best-effort redaction before being returned as private plain text. Spark files remain private binary downloads. Never publish diagnostic files as public website assets.
