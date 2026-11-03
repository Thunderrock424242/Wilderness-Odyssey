# Private playtester inbox

The staff page is `/admin/playtester-chat/`, linked under Community → Playtester inbox. It connects Discord bot DMs to a private website inbox; no public Discord server membership is required for testers.

## Staff access

The configured Discord server's current owner has inbox access automatically after normal `/dashboard enable` enrollment and website sign-in. The owner can approve or revoke other accounts from the inbox page. An approved account must also have current Discord Administrator permission in the configured server and its own dashboard enrollment. Approval grants inbox access only; it does not assign Discord roles or change other dashboard permissions. Other administrators cannot grant access to themselves or others.

Every staff read, reply, download and update request is authorized by the bot. Downloads recheck both staff sessions and the backend inbox approval after streaming. Removing an approval, Discord Administrator permission, server membership or dashboard enrollment stops subsequent requests and queued delivery.

## Tester conversations

An active claimed playtest membership or an unexpired, unrevoked invitation allows that Discord account to DM the bot. The invitation explains that messages and diagnostic attachments are shared privately with the chosen admin team. A tester with one available campaign routes there automatically; a tester with several campaigns must choose one. Messages are never duplicated into several campaigns.

- `chat CAMPAIGN_ID` selects the campaign and resumes forwarding.
- `chat off` stops chat forwarding, including an attachment currently being fetched.
- `chat start` resumes forwarding.
- `updates off` stops campaign update DMs; `updates on` resumes them.

The admin page shows conversations, earlier messages, attachments, staff replies and delivery states. Refresh checks new messages and delivery; it does not poll continuously. Replies are queued privately and sent by the bot. A campaign update snapshots eligible, opted-in recipients, then rechecks each recipient's eligibility before dispatch. Update messages recommend joining the Discord community while explicitly saying it is optional.

Accepted announcements can continue after the initiating website session expires or signs out; current enrollment, Discord permission and owner approval are still checked before every send. Dashboard disable or approval/role revocation cancels pending sends. Replies expire after 10 minutes if still queued; campaign updates have a 24-hour delivery window. Discord refusals are failed; ambiguous sends are unknown and are not automatically replayed. A process interruption marks any in-progress send unknown. A queued receipt does not mean sent, delivered or read.

## Diagnostics and privacy

Send Spark viewer links as normal chat text. The bot does not visit or fetch those links. Attach `.txt`, `.log` or `.json` text diagnostics up to 512 KiB each, or `.sparkprofile` files up to 5 MiB each. At most three attachments and 10 MiB total are accepted per message. Downloads come only from Discord's approved HTTPS CDN hosts, reject redirects, use request deadlines and enforce streamed size limits. Text diagnostics use the existing log redactor; automatic redaction is best effort and testers should remove remaining sensitive information before sending.

Files are stored as private database blobs and served only as authenticated downloads with safe generated response filenames, no-store, nosniff and sandbox headers. Message bodies are rendered as text. There are no public artifact URLs, AI submissions or automatic GitHub reports in this flow.

Limits are 4,000 characters per incoming message, 20 stored tester messages per minute, 10,000 total inbox messages, 100 MiB stored diagnostics, and a 20 MiB reservation budget for concurrent attachment intake. Owner approvals are capped at 100 accounts and broadcasts at 1,000 eligible recipients. Idempotency receipts expire after 24 hours. Messages, diagnostics and broadcast metadata expire after 90 days, with hourly cleanup. Backups may retain older content; keep them private and apply backup retention separately.

## Installation and rollout

Deploy the bot changes first, then the bot-gateway Worker, then this website. Preserve the existing bot database and all existing environment settings. No new secret or environment variable is required. The bot enables its Discord DirectMessages intent and Channel partial so outside-server DMs can be received, while preserving guild command handling.

The bot API is `/v1/admin/playtester-chat`; Pages exposes only the same-origin `/api/admin/v1/playtester-chat` family. It reuses signed machine authentication, Discord staff sessions, CSRF, strict schemas and idempotency keys. Do not expose the bot's raw listener or use the development static preview as an authentication layer.

After rollout, verify with a test invitation: owner approval, a chosen administrator login, an outsider's DM, text and Spark uploads, a website reply, campaign selection, chat/update opt-outs, DM refusal, and revocation. Local tests use synthetic Discord/backend responses and do not prove live credentials, gateway bindings, Discord delivery or host persistence. No production deployment or real tester messages are part of local validation.
