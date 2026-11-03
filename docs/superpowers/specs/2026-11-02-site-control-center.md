# Website control center and outside-server playtest invitations

## Intent

The website should become the main control center for the Discord bot. The user reports that the hosted content editor says access denied despite a successful administrator sign-in. Keep the bot focused on Discord and trusted service integration; website UI remains owned by the website branch.

## Findings

- `ConnectedRuntime.inviteParticipant` requires the invited account to be a guild member. The existing website already accepts a Discord account ID and displays a private claim link if DM delivery fails.
- The website expects `content:read`, `content:write`, `content:publish`, configuration capabilities, and playtest capabilities. The bot exposes only its original eight capabilities. The website denies content access before attempting an editor read.
- The bot also lacks the website's `/content/*` and `/configuration/*` implementations. Granting permissions alone would replace the access error with missing-route failures.
- Existing website contracts and a prior hosted-editor design are on branch `website`. Reuse them; do not invent a second login, expose the local editor publicly, or merge website UI into the bot branch.

## Approaches

Recommended: extend the existing authenticated Kinetic API and durable SQLite store. It already owns live Discord authorization, monitoring, moderation, operations, and playtest diagnostics. Reuse the website's editor/contracts and keep publication separate from draft saving.

Alternative: introduce a separate management/CMS service. This adds storage, authentication, deployment, and synchronization responsibilities without solving a current architectural limitation. Not recommended.

## Delivery order

1. Outside-server playtests: accept an explicit Discord ID, validate the account without requiring guild membership, retain administrator authorization and account-bound expiring links, and return the private fallback link when DM delivery cannot be confirmed. Website membership grants no staff authority or game collection consent.
2. Hosted editor: align supported capabilities with actual implemented routes; provide durable private transmission/page drafts, bounded validated private media, revision conflicts, and initial source import. Preserve source records and prevent executable Markdown/unsafe links. Connect real publication through narrow reviewed repository changes; never report a saved draft as published. Reuse the existing website contracts.
3. Control center: preserve maintenance, service checks, AI admission/models, player moderation, reports, and campaign controls already on the site. Inventory remaining Discord staff functions and expose focused authenticated actions for announcements, support panels, report/ticket triage, known issues/changelog, and bot monitoring/settings where applicable. Never expose arbitrary shell commands, environment editing, arbitrary HTTP destinations, or credential reads.

## Constraints

Node.js 22 compatibility; existing startup and environment names preserved. No secrets in source, browser assets, audit records, or private draft responses. Every staff operation requires current backend authorization; queued effects recheck authority. External calls and bodies are bounded. Use strict input schemas, revisions, idempotency, and audits for mutations. Preserve unrelated local files.

The existing hosted-editor design at `website:docs/superpowers/specs/2026-10-07-hosted-admin-content-and-settings-design.md` governs source import, media validation, repository publication, protected deployment, connection allowlists, encrypted credentials, and truthful application states. Those responsibilities require real implementations and configuration; do not fill their routes with mock success responses.

## Validation

Regression tests for outsider invitations, DM failures, wrong-account claims, expiry/revocation, malformed IDs and bot accounts, and lost staff authorization. Editor tests cover actual session permissions plus authenticated draft/media routes, stale revisions, malformed/unsafe content, source preservation, and publication states. Run repository compiler checks, full tests, and production build. Website changes require that branch's verification and browser tests. Local tests do not demonstrate deployed Kinetic/Pages/GitHub behavior.

## Rollout

Prepare and validate source locally before deployment. Keep external hosting changes and production publication reviewable. Report any required host setup and distinguish backend readiness, website readiness, and live verification.
