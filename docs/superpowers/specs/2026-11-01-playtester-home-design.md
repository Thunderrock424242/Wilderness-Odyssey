# Invited playtester home

Approved scope: visible Sign in navigation on desktop and mobile, Discord authentication for administrators and invited playtesters, account-bound DM invitations, and a private tester home with recorded playtime and playtesting history.

## Experience

Staff selects a Discord account and campaign. The bot sends an expiring private claim link. The recipient signs in with Discord, then explicitly claims the invitation. A different Discord account cannot claim it. No passwords or website login credentials are issued. If DMs fail, staff sees a delivery failure and can privately share the same account-bound link.

The tester home displays current invitations, claimed playtests, build instructions, announcements, tasks, support/feedback links, recorded playtime, session dates, tested builds, and participation status. Only the signed-in tester's records appear. Missing durations are unavailable, never zero or inferred from login time. Totals describe recorded sessions, not lifetime gameplay. Open or interrupted sessions with unknown duration remain excluded from totals and clearly identified.

Administrators keep the current permission checks. A tester session never grants staff capabilities. A person with both memberships can enter their tester home or admin dashboard; revoking one membership does not grant the other.

Website claims establish account participation only. Existing installation enrollment and diagnostic consent remain explicit in the game. Website claim tokens must never be accepted as installation enrollment credentials.

## Architecture and constraints

Trusted bot code owns account membership, invitations, sessions, revocation and record filtering. Pages validates signed-in identity and response scope; browser visibility is never authorization. Existing human Cloudflare Access protection stays on admin paths, while tester paths use bot-verified Discord sessions without an administrator email gate. Machine Access remains mandatory between Pages, gateway Worker and bot.

Use additive SQLite migrations and preserve DATABASE_PATH and existing diagnostic records. Bind claims to guild, Discord user and campaign; store only token digests, consume atomically, enforce expiry and revocation, and make retries safe. Claim mutation uses same-origin checks and CSRF protection. Avoid tokens in query strings, logs, analytics or browser storage. Read a private claim fragment into memory, remove it from the address bar immediately, then require sign-in and an explicit claim submission. If navigation loses the fragment, ask the tester to reopen the DM after login rather than persisting the token.

Backend projections omit private staff notes, artifacts, other testers and secrets. Query ownership using authenticated Discord identity, never caller-supplied tester IDs. Bound results and paginate history; calculate aggregate statistics across authorized records on the backend, independently of the displayed page. Revocation invalidates subsequent reads and mutations, including slow in-flight reads. Authentication is short-lived and logout revokes it.

## Approaches

Selected: staff picks a Discord account; DM a private claim link; Discord verifies identity. This prevents forwarded links granting another account access. Alternative bearer-only invitation links are simpler but do not satisfy account binding. Separate username/password credentials add recovery and storage obligations and are unnecessary because the user selected Discord login.

## Repository finding

Website branch already has staff OAuth, Pages gateway, campaign administration and a game-enrollment instruction page. The bot branch already stores Discord IDs on testers and diagnostic sessions, but dashboard authentication only permits administrators. Its diagnostic API contract also differs from the newer website playtest contract. Integrate against the real bot records and add explicit website contracts; do not assume the existing staff dashboard API is already compatible or expose staff endpoints to testers.

## Completion

Bot and website changes require independent validation and coordinated deployment. Before production activation: test account mismatch, expiry, replay, revocation, failed DMs, logout, missing durations, pagination, dual-role access and cross-account isolation. Verify desktop/mobile navigation, keyboard access, Pages runtime and legacy redirects. No claim of deployment or end-to-end success without live verification.
