# Wilderness Odyssey owner guide

The staff dashboard connects the public website, the Discord bot, and approved Minecraft/Aether services. Each has its own deployment and permissions. A page being available does not prove that its remote service is configured or running.

Open [Owner guide & setup](/admin/help/) in the website for live content-storage and publication readiness checks. Sign in with the intended Discord account. Staff access does not automatically give that account playtester membership or access to private inbox conversations.

## Prepare the content editor

Public website source and private editor drafts are separate. An empty transmission archive or missing site, roadmap and gallery records can mean the private database has not been initialized, even when the public site is working.

In Owner guide & setup, review the import notice, acknowledge it, and choose **Import missing website content**. This imports the public source bundled with that website build, adds missing records, and preserves existing private drafts. It does not request publication or deploy anything. Deploy the intended website revision first if the currently served build is outdated. Refresh the editor after importing.

Importing is not a way to overwrite a private draft with newer public changes. When both have changed, have the host administrator reconcile the record using the process in [hosted-admin-setup.md](hosted-admin-setup.md).

## Choose the right dashboard section

| Section | Use it for |
| --- | --- |
| Server management | Service health, Minecraft performance, incidents, maintenance notices, pausing new Aether requests, and approved service-operation requests. Refresh to confirm results; acceptance does not mean completion. |
| Player moderation | Verified Minecraft player lookup, moderation history, appeals, warnings, and permitted Aether restrictions. |
| AI conversation moderation | Player-submitted reports and attached excerpts; resolving or escalating cases. There is no general private AI conversation archive. |
| AI model management | Model readiness, approved model changes, and permitted inference settings through the connected service. |
| Playtests | Campaigns, build labels, retention, diagnostic client invitations, tester permissions, histories, and private artifacts. |
| Playtester inbox | Shared private bot DMs and attachments, queued replies, and campaign update DMs. The owner approves inbox administrators. |
| Playtester website access | Account-bound website invitations, campaign home instructions, announcements and tasks, and website membership revocation. |
| My playtester home | The campaigns claimed by your own Discord account. Administrator access alone does not enroll you. |
| Content editor | Transmission posts: news, blogs, dev logs, patches, lore and announcements, plus images and metadata. |
| Site, roadmap & gallery | Private drafts of supported site information, roadmap records and gallery captions. |
| Service settings | Read-only host-managed connection configuration and setup readiness. Change connection settings and credentials on the trusted host. |
| Public website / Public status | What visitors can currently see and the public service status that is actually available. |

Actions still require the correct server-side permissions. A denied page is not a reason to broaden every administrator’s access.

## Set up a playtester

1. Create a campaign in **Playtests** and note its campaign ID.
2. In **Playtester website access**, invite the tester’s Discord account and save build instructions and tasks. Staff can also use `/playtester invite` in Discord with the account and campaign. The bot sends a private claim link usable only by that account; if DMs fail, share the fallback privately with that tester.
3. If diagnostic collection is needed, create a separate client invitation in **Playtests**. The tester needs the compatible diagnostic client, installation enrollment, and explicit local consent. A website invitation does not enable diagnostics or prove recording has started.
4. For private support, ask the tester to DM the bot `chat CAMPAIGN_ID`. Explain that these messages and attachments are shared with the owner’s approved administrator team in **Playtester inbox**.

Testers use `chat off` / `chat start` to pause or resume inbox sharing and `updates off` / `updates on` to control campaign update DMs. A queued message is not proof of delivery. Refresh the inbox for delivery results; Discord privacy settings can block DMs.

A private Discord channel or group is recommended for general announcements and shared discussion. Joining the Discord server is optional for playtesting. Keep personal support and diagnostic files private.

Website membership, diagnostic installation access, and inbox access are separate. Revoking website membership does not revoke diagnostic installations; use Playtests to control collection and diagnostic access. Share the website’s [launch troubleshooting page](/support/troubleshooting/) when the game cannot start.

The dashboard reports evidence it receives. Unreported session timing, mode, upload errors and Spark status remain unknown. Server profiles are unavailable until a real source is connected. Do not interpret missing telemetry as a healthy session or failed collection without checking the client and service.

## Save and publish content

1. Edit a transmission or a site/roadmap/gallery record and save it. This stores a private draft in the bot database.
2. Review the saved content and acknowledge that publication will expose its source and included images in a public GitHub pull request. Remove private messages, logs and secrets first.
3. Request publication. The configured GitHub App freezes the saved revision, creates a publication branch, and opens a pull request against `website`.
4. Review the pull request, pass its checks, and merge it through normal GitHub permissions. Approve any protected deployment when required.
5. Check publication status and the live page. The tracker verifies the deployment and matching public revision; a merged pull request or passing check alone is not proof of publication.

Draft editing and GitHub publication have separate setup requirements. If publication is unavailable, keep the draft and ask the host administrator to complete the GitHub App and deployment configuration. A publication failure does not discard the draft. Resolve source conflicts against the latest website source before resubmitting.

## Check a problem before retrying

- **Empty editors:** check setup and import missing public source; refresh afterward. Avoid making duplicate posts to replace records that already exist publicly.
- **Access denied:** check the account, administrator enrollment, required permission, and any inbox approval. Renew an expired sign-in. Persistent denials need a permission or host configuration check.
- **Playtester home is empty:** claim a website invitation for that exact Discord account. Being an administrator or having a client invitation is separate.
- **Service unavailable:** check the real service and connection readiness. Service settings is informational; the trusted host manages credentials and connection changes.
- **Changes missing online:** verify the bot commit deployed on Kinetic from `bot`, the successful production website deployment from `website`, and the gateway deployment from the intended website revision. Check the website’s `/revision.json` against the expected website commit. A local build or a push to another branch does not update all three services.

For support, record the page, attempted action, time, and short error message. Share private diagnostic files only through authorized channels. Never include tokens, private invitations, or private host configuration in a public report.

For host setup details, use [hosted-admin-setup.md](hosted-admin-setup.md), [playtest-backend.md](playtest-backend.md), and [playtester-inbox.md](playtester-inbox.md).
