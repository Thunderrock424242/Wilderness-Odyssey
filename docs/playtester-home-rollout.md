# Playtester home rollout

The website and bot changes are a coordinated feature. No new OAuth secret, password, or callback registration is required. Tester OAuth uses the existing Discord callback, separate participant flow/session cookies, and separate backend session tables.

## What changes

- A Sign in link remains visible outside the collapsed public navigation on desktop and mobile.
- /login/ offers Playtester sign-in and existing administrator sign-in.
- /playtester/ loads only the signed-in tester's claimed campaigns, pending invitation summaries, recorded session time, tested builds and history.
- /playtester/claim/ reads a private DM fragment, clears it immediately, and requires explicit acceptance from the selected Discord account.
- /admin/playtester-access/ provides administrator invitation, revocation and tester-facing content controls.

astro.config.mjs now excludes tester pages from the sitemap; its base remains /. Existing legacy redirects and human staff Access protection remain intact. The generated-site checker recognizes the exact new dynamic /api/participant/start endpoint. Pages and the Worker enforce participant route/schema/header allowlists, ownership and private responses.

## Deploy together

1. Preserve and back up the Kinetic bot SQLite database. Deploy the matching bot source and build it. Keep the existing launcher, Main File and private environment.
2. Register /playtester with the bot's existing npm run deploy script in its private hosting environment, then restart the bot normally.
3. Deploy the gateway Worker from workers/bot-gateway/wrangler.jsonc through the established deployment process.
4. Publish the website through its existing protected workflow and owner approval. Do not disable preview Access or production verification.
5. Human staff Access remains limited to admin paths. Tester /playtester/* and /api/participant/* paths use Discord tester sessions, without an administrator email gate. Machine Access remains required upstream.

Bot setup details are documented in the bot branch docs/playtester-home.md. Use /playtester create campaign:alpha title:Alpha expedition, then /playtester invite account:@tester campaign:alpha. Staff must have current Discord Administrator permission. A blocked/uncertain DM produces a private fallback link restricted to that same account.

The tester signs in with Playtester sign-in, reopens their DM, and claims it. No Discord password is entered on this site. Website claiming never enrolls the game or enables diagnostics.

## Statistics

Totals cover recorded game sessions belonging to trusted tester records whose Discord user matches the signed-in account and whose campaign membership is active. Unknown timing is excluded and explicitly counted. Overlapping known intervals count once. History pages contain 25 sessions; totals are independent of pagination. New valid terminal session reports provide timing and build metadata; earlier reports may remain unavailable. These are client-reported records, not proof of gameplay.

## Validation and rollback

Local checks cover claims, session separation, machine trust, account isolation, CSRF, callback purpose, expiry, revocation, DM failure/timeouts, pagination, statistics and responsive UI. Live activation still needs an invited tester and administrator to complete Discord sign-in themselves, then verify a wrong-account claim, blocked DM, withdrawal and game-reported statistics.

Roll back the website and Worker together if required. Keep the additive bot tables and existing database during rollback; never reset production data or change DATABASE_PATH to make setup easier.
