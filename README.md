# Wilderness Oddesy Discord Bot

Friendly Discord support and dev help desk bot for the **Wilderness Oddesy** Minecraft modpack community. It helps players submit bugs, crash logs, suggestions, feedback, optional performance reports, Spark profiler links, and organized playtesting sessions.

The personality is light in-universe support AI: helpful, calm, and a little eerie, without making support answers confusing.

## Stack

- Node.js
- TypeScript
- discord.js v14
- Slash commands
- Buttons, select menus, and modals
- Optional Q&A channel message responder
- SQLite with Node's built-in `node:sqlite`
- `dotenv` for secrets and server configuration

## Privacy and Security

- The Discord bot token is never hardcoded.
- Secrets and channel IDs live in `.env`.
- `.env` and local SQLite files are ignored by git.
- Crash, performance, bug-log, and Spark reporting are opt-in.
- The bot does not ask for private/personal information.
- Log parsing redacts tokens, emails, IP addresses, and common local file paths before storage.
- Reports should not include chat logs, passwords, tokens, IP addresses, or personal files.
- In the configured community Q&A forum, the bot reads new forum posts so it can answer known support topics, alert support, and pull in devs for crash or bug-looking posts.
- The bot stores submitted Spark viewer links, but does not scrape private Spark data or run Minecraft commands.
- A Minecraft server-side mod can complete account verification through a private Discord webhook relay. Never put the Discord bot token inside a Minecraft mod.

## Setup

1. Create a Discord application at the [Discord Developer Portal](https://discord.com/developers/applications).
2. Open the application, create a bot, and copy the bot token.
3. Copy `.env.example` to `.env`.
4. Fill in `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, channel IDs, and support/status values.
5. Invite the bot with OAuth2 scopes:
   - `bot`
   - `applications.commands`
6. If using Q&A auto-responses or Minecraft server verification relay, enable Message Content Intent for the bot in the Discord Developer Portal.
7. Give the bot permission to send messages, embeds, and buttons in configured report channels.
8. Install dependencies:

```bash
npm install
```

9. Deploy slash commands:

```bash
npm run deploy
```

10. Start the bot:

```bash
npm run build
npm start
```

Development:

```bash
npm run dev
```

## Environment Variables

Use `.env.example` as the source of truth. It is grouped in setup order and has comments next to each section.

Fast path:

1. Fill `DISCORD_TOKEN`, `CLIENT_ID`, and `GUILD_ID`.
2. Fill the support hub values: `SUPPORT_CHANNEL_ID`, `SUPPORT_TEAM_ROLE_ID`, `SUPPORT_TICKET_CATEGORY_ID`, and `STAFF_LOG_CHANNEL_ID`.
3. Fill the forum IDs: `ISSUES_FORUM_CHANNEL_ID` and `IDEAS_FORUM_CHANNEL_ID`.
4. Make sure your Discord forum tags match `BUG_FORUM_TAG`, `BUG_CONFIRMED_FORUM_TAG`, `BUG_SOLVED_FORUM_TAG`, `CRASH_FORUM_TAG`, `PERFORMANCE_FORUM_TAG`, `FEEDBACK_FORUM_TAG`, and `SUGGESTION_FORUM_TAG`.
5. Fill report/playtest channels: `SPARK_REPORTS_CHANNEL_ID`, `PLAYTEST_SESSIONS_CHANNEL_ID`, and `PLAYTEST_CATEGORY_ID`. `PERFORMANCE_REPORTS_CHANNEL_ID` is only needed if you are not using `ISSUES_FORUM_CHANNEL_ID`.
6. Leave optional Q&A, status text, policy links, and Minecraft verification values blank until you are ready to use those features.

For every Discord channel, category, forum, server, or role value, paste the copied Discord ID number. Do not use `#channel-name` or `@role-name` for ID fields.

Reliability settings:

- `LOG_LEVEL` controls structured bot logs. Use `info` normally and `debug` while troubleshooting.
- `SENTRY_DSN` enables optional hosted error tracking through Sentry.
- `METRICS_ENABLED=true` exposes Prometheus metrics at `METRICS_PATH`, defaulting to `/metrics`, on the bot HTTP API port.

## Database

The SQLite database is created or migrated on startup at:

```text
data/wilderness-oddesy.sqlite
```

Tables:

- `bug_reports`
- `crash_reports`
- `performance_reports`
- `feedback_reports`
- `known_issues`
- `changelog_entries`
- `playtest_sessions`
- `playtest_releases`
- `playtest_release_acceptances`
- `qa_forwards`
- `qa_answers`
- `minecraft_link_codes`
- `minecraft_links`
- `spark_reports`
- `suggestions`
- `suggestion_votes`
- `report_links`
- `report_updates`

`report_links` lets a playtest session link to bug reports, crash reports, Spark reports, and feedback reports.

## Player Commands

- `/help` - interactive support menu.
- `/installhelp` - launcher/import troubleshooting for CurseForge ZIPs, Modrinth, Prism, Java/RAM, clean profiles, and server/client mismatch.
- `/privacy` - explains what the bot collects and what it avoids.
- `/bugreport` - opens a private guided intake channel and saves a structured bug report as `WO-BUG-0001`; supports Minecraft/loader version, repeatability, special-content context, screenshots, optional redacted log attachment, optional Spark link, and optional playtest session link.
- `/suggest` - opens a suggestion modal, saves as `WO-SUG-0001`, posts to the suggestions channel, and adds Upvote, Downvote, and Needs discussion buttons.
- `/feedback` - opens a feedback modal with playtesting categories and optional playtest session link.
- `/crash` - opens a private guided crash intake; optional `.txt` or `.log` attachment is redacted, checked for common crash signatures, saved as `WO-CRASH-0001`, and can link to a playtest session.
- `/performance` - shows performance reporting guidance.
- `/perfreport` - opens a private guided performance intake saved as `WO-PERF-0001`.
- `/sparkreport` - validates and archives a Spark viewer/report URL as `WO-SPARK-0001`, linked to a playtest session.
- `/minecraft link` - creates a one-time Minecraft verification code for in-game `/wo link`.
- `/minecraft status` - shows the linked Minecraft account.
- `/minecraft unlink` - removes the linked Minecraft account.
- `/playtest start` - creates `WO-TEST-0001` and gives Spark profiling instructions.
- `/playtest end` - ends a playtest session and posts a summary.
- `/playtest checklist` - shows the singleplayer stability checklist.
- `/knownissues` - shows staff-configured known issues; accepts an optional version filter.
- `/changelog` - shows recent changelog entries.
- `/status` - shows modpack version, Java/RAM recommendations, support channels, unstable features, and server status placeholder.

## Panels

Staff can run `/supportpanel` in a channel to post persistent button/menu panels. Use `panel_type:all` to post the player-facing support, info, and playtest panels together.

Recommended server layout:

- Put the public support hub in an Information, Start Here, or Welcome category.
- Put bug/crash/performance and feedback/suggestion forums in a Support or Triage category.
- Put private Other Help and report intake channels in a staff/private support category through `SUPPORT_TICKET_CATEGORY_ID`.

For Discord forum channels, set `ISSUES_FORUM_CHANNEL_ID` for shared bug/crash/performance posts and `IDEAS_FORUM_CHANNEL_ID` for shared feedback/suggestion posts. The bot applies the configured forum tags, defaulting to `Bug`, `Crash`, `Performance Issues`, `Feedback`, and `Suggestion`. Bug threads can also use status tags, defaulting to `Confirmed` and `Solved`, when staff marks the bug as confirmed or solved from inside the forum thread.

Set `SUPPORT_TEAM_ROLE_ID` to the staff/support role that should be pinged on new support items, including Q&A forum posts, performance reports, feedback, suggestions, and private tickets. Set `DEV_TEAM_ROLE_ID` so crash and bug reports also alert the dev team.

Panel types:

- Support Hub - report bugs, crashes/logs, feedback, performance, suggestions, playtest help, and Q&A.
- Player info center - status, known issues, changelog, privacy, and command map.
- Playtest center - start a tester session, view checklist, get ZIP/Spark guidance, and open report forms.
- Staff console - staff-only reference for report lookup, statuses, known issues, changelog, playtest publishing, and Q&A handoffs.
- Setup doctor - staff-only config, channel, and permission health checks.
- All player panels - posts Support Hub, player info, and playtest center.

Support Hub dropdown options:

- Bug report - shows a quick known-issues check, then opens a private guided bug intake.
- Crash / logs - shows a quick known-issues check, then opens a private guided crash intake.
- Performance issue - opens a private guided performance intake and posts to the issues forum with the performance tag after confirmation.
- Feedback - opens a feedback modal.
- Suggestion - opens a suggestion modal with voting on the created forum post.
- Help me pick - shows a short routing menu for users who are not sure.
- Other help - asks for a summary/details, then creates a private staff ticket.
- Playtest help - explains playtest ZIP acceptance, `/playtest start`, and report linking.
- Q&A question - points players to the community Q&A forum when configured.

Bug, crash, and performance intakes ask one question at a time in a private channel. Players can reply `n/a` for optional fields, review the answers, edit a selected field, and then confirm before the forum post is created. Bug and performance reviews show local duplicate hints from known issues and previous reports when a strong match is found; crash posts show duplicate hints after the log signature is analyzed.

Playtest panel sessions create normal `WO-TEST-0001` records, so later bug reports, feedback, crashes, performance reports, and Spark reports can still be linked to the tester session.

Report receipts include an `Add more info` button so the submitter can append details later. Staff report posts include a `Claim / Reassign` button for bug, crash, performance, and Spark reports.

Other Help and private report intake tickets include staff buttons for Claim and Close. Closing a private ticket posts a transcript to `STAFF_LOG_CHANNEL_ID`, sends the transcript to the ticket owner, then deletes the channel. Move buttons on Other Help tickets give staff routing instructions so incomplete private tickets do not become low-quality public reports.

## Community Q&A Forum

Create a Discord forum for player questions and set `QA_FORUM_CHANNEL_ID` to that forum. Each new forum post becomes one organized Q&A thread. The bot answers known support topics such as Java, RAM, crashes, bugs, performance, Spark, CurseForge ZIP import, and known issues with embed replies.

Built-in keyword answers live as `.txt` files in `qa-responses`. The file name without `.txt` is the topic and embed title. Put files in `qa-responses/crash`, `qa-responses/bug`, `qa-responses/performance`, or `qa-responses/general` to choose the embed color/category.

Each topic file has a `phrases:` section for common words or questions to match, and a `response:` section for the embed body:

```text
phrases:
- crash
- crashed
- latest.log
- where is my crash report

response:
Use the Support Hub button **Crash / logs** for private guided intake.
```

The Q&A matcher is used in configured question channels and, for help-looking messages, inside guided support intake channels. Text file edits are read at runtime, so the bot does not need a code change for response wording or trigger phrases.

Set `QA_ALERT_CHANNEL_ID` to a private support alert channel. New Q&A forum posts are saved as `WO-QA-0001` records and posted there. By default the alert pings `QA_ALERT_ROLE_ID`; if that is blank, it falls back to `QA_TEAM_ROLE_ID`, then `SUPPORT_TEAM_ROLE_ID`.

If a Q&A forum post looks like a crash or bug report from its title, body, or forum tags, the alert also pings `DEV_TEAM_ROLE_ID`. Performance-looking Q&A posts alert support for triage.

`QA_CHANNEL_IDS` is still supported as a legacy text-channel fallback. In those channels, the bot answers known questions and forwards unknown questions to `QA_ALERT_CHANNEL_ID`.

Staff can add reusable canned answers with `/staff qa add`. Each answer has comma-separated trigger terms, a title, and answer text. Staff-added answers are checked before the `.txt` defaults. Use `/staff qa edit <id>` to tune an existing answer, `/staff qa list` to review recent entries, and `/staff qa remove <id>` to disable one.

## Minecraft Verification

Minecraft verification links a Discord user to a Minecraft player without putting a Discord bot token in a Minecraft mod.

Recommended server relay flow:

1. Player runs `/minecraft link` in Discord.
2. The bot gives a one-time code that expires after `MINECRAFT_VERIFY_CODE_TTL_MINUTES`.
3. Player joins the official playtest Minecraft server.
4. Player runs `/wo link <code>` on that server.
5. The server-side Wilderness Oddesy API mod sends the code, Minecraft UUID, and Minecraft name to a private Discord webhook relay channel.
6. The Discord bot reads that private relay message and stores the link in `minecraft_links`.
7. If `MINECRAFT_VERIFIED_ROLE_ID` is configured, the bot also gives the player that Discord role.

Create a private text channel for the relay, then create a Discord webhook in that channel. Put the webhook URL only in the Minecraft server config. Put the channel ID and optional exact webhook ID in the bot `.env`:

```env
MINECRAFT_VERIFY_RELAY_CHANNEL_ID=123456789012345678
MINECRAFT_VERIFY_RELAY_WEBHOOK_ID=123456789012345678
MINECRAFT_VERIFIED_ROLE_ID=123456789012345678
MINECRAFT_VERIFY_CODE_TTL_MINUTES=15
```

The server-side mod should post this JSON as the webhook message content:

```json
{
  "type": "wo_minecraft_verify",
  "code": "ABC234",
  "minecraftUuid": "player-uuid",
  "minecraftName": "PlayerName"
}
```

If `MINECRAFT_VERIFY_RELAY_WEBHOOK_ID` is set, the bot rejects relay messages from any other webhook. If it is blank, keep the relay channel private so only the server webhook and staff can post there.

Optional client API fallback:

Enable the API on the Discord bot host only if the bot has a public URL that playtest clients can reach:

```env
MINECRAFT_VERIFY_API_ENABLED=true
MINECRAFT_VERIFY_API_HOST=0.0.0.0
MINECRAFT_VERIFY_API_PORT=3000
MINECRAFT_VERIFY_PUBLIC_URL=https://your-bot-api.example.com
```

In the `wildernessodysseyapi-4.1.0.jar` client config, set the base URL only:

```toml
# config/wildernessodysseyapi/wildernessodysseyapi-playtest-client.toml
[verification]
enabled = true
apiBaseUrl = "https://your-bot-api.example.com"
requestTimeoutSeconds = 10
rememberLinkedAccount = true
```

Do not include `/api/minecraft/verify` in `verification.apiBaseUrl`; the client mod appends that endpoint path itself.

The client mod should send:

```http
POST /api/minecraft/verify
Content-Type: application/json
```

```json
{
  "code": "ABC234",
  "minecraftUuid": "player-uuid",
  "minecraftName": "PlayerName"
}
```

Successful response:

```json
{
  "ok": true,
  "discordUserId": "1234567890",
  "minecraftUuid": "player-uuid",
  "minecraftName": "PlayerName"
}
```

## Startup Notices

If `STAFF_LOG_CHANNEL_ID` or `STAFF_REVIEW_CHANNEL_ID` is configured, the bot posts a startup card when it connects. The card shows panel shortcuts and obvious config warnings such as missing report channels, Q&A routing gaps, or missing playtest policy URLs.

## Staff Commands

Staff commands require administrator, manage server, or moderator permissions. `/shutdown` is more restricted and requires administrator or manage server permissions plus `confirm:shutdown`.

- `/supportpanel` - posts support/info/playtest/staff button/menu panels.
- `/shutdown confirm:shutdown reason:<optional>` - safely shuts down the bot process after replying.
- `/staff bug status <id> <status>`
- `/staff crash status <id> <status>`
- `/staff suggestion status <id> <status>`
- `/staff spark status <id> <status>`
- `/staff spark notes <id>`
- `/staff issue add`
- `/staff issue remove <id>`
- `/staff issue update <id>`
- `/staff changelog add`
- `/staff qa add`
- `/staff qa edit <id>`
- `/staff qa list`
- `/staff qa remove <id>`
- `/staff ops digest`
- `/staff privacy view <user>`
- `/staff privacy anonymize <user> reason:<optional>`
- `/staff privacy unlink_minecraft <user>`
- `/staff github import_knownissues limit:<optional>`
- `/staff report view <id>`
- `/staff report search <keyword>`
- `/playtest publish` - staff-only: creates a public playtest channel, posts a terms/privacy acceptance gate, and privately sends the playtest ZIP link plus CurseForge import steps after acceptance.
- `/playtest release_list`
- `/playtest release_view <release_id>`
- `/playtest release_close <release_id>`
- `/playtest list`
- `/playtest view <session_id>`

`/staff ops digest` summarizes open/unclaimed reports, top suggestions, active playtests, release acceptances, Q&A handoffs, and known issue count. `/staff privacy` provides data-request tooling for summaries, local anonymization, and Minecraft verification unlinking. `/staff github import_knownissues` imports or refreshes labeled GitHub issues as known issues when `GITHUB_REPOSITORY` is configured.

GitHub known-issue import:

```env
GITHUB_REPOSITORY=owner/repo
GITHUB_TOKEN=
GITHUB_API_BASE_URL=https://api.github.com
GITHUB_KNOWN_ISSUE_LABELS=known issue,known-issue,bug
```

`GITHUB_TOKEN` is optional for public repositories, but required for private repositories or stricter rate limits.

Bug statuses:

- `open`
- `investigating`
- `confirmed`
- `solved`
- `fixed`
- `duplicate`
- `needs_more_info`
- `wontfix`

Marking a bug `confirmed` creates or updates a sourced known-issues entry for that bug. Marking it `solved` updates that same known-issues entry as `solved`, which displays as an upcoming fix on `/knownissues`. When the status action happens inside a Discord forum thread, the bot also swaps the bug's forum status tag to `Confirmed` or `Solved`.

Suggestion statuses:

- `under_review`
- `planned`
- `accepted`
- `rejected`
- `added`

Spark statuses:

- `new`
- `needs_review`
- `bottleneck_found`
- `not_enough_data`
- `resolved`

Bug report embeds include staff buttons for confirmed, solved, investigating, fixed, duplicate, needs more info, and wontfix.

## Spark Playtesting Flow

The bot organizes Spark links; it does not run Minecraft commands inside a player game.

1. Verify your Minecraft account with `/minecraft link`, then join the playtest server and run `/wo link CODE`.
2. Run `/playtest start`.
3. Start Minecraft and load into the test world.
4. If testing server TPS or world lag, run Spark during the lag period.
5. For servers, use `/spark profiler start --timeout 120`.
6. For Forge/Fabric client installs, Spark may use `/sparkc` instead of `/spark`.
7. After Spark finishes, copy the Spark viewer link.
8. Submit it with `/sparkreport`.

## Staff Playtest Package Flow

Use `/playtest publish` when a dev wants to distribute a closed playtest build.

In-house policy source docs are available in:

- `docs/playtest-terms.md`
- `docs/privacy-policy.md`

The bot shows compact versions of these policies directly in Discord through `View Terms` and `View Privacy` buttons on each playtest gate. `PLAYTEST_TERMS_URL` and `PLAYTEST_PRIVACY_URL` are optional external copies only.

1. Staff runs `/playtest publish` with the playtest title, modpack version, focus, expected duration, and CurseForge export ZIP.
2. The bot creates a new playtest channel in `PLAYTEST_CATEGORY_ID` when configured, otherwise in the current channel category.
3. The bot posts playtest instructions with `View Terms`, `View Privacy`, and `I accept terms and privacy` buttons.
4. Players verify their Minecraft account with `/minecraft link`, then join the playtest server and run `/wo link CODE`.
5. Players can read the in-bot terms/privacy embeds before clicking `I accept terms and privacy`.
6. After a verified player accepts, the bot privately sends the ZIP download link and CurseForge import steps.
7. The bot records one acceptance per user for the playtest package.
8. Verified players use `/playtest start`, `/bugreport`, `/crash`, `/feedback`, `/perfreport`, and `/sparkreport` during the test.

Recommended ZIP instructions sent to testers:

1. Download the ZIP and do not unzip it.
2. Open CurseForge and choose Minecraft.
3. Choose Create Custom Profile, then use the import option for an existing ZIP/profile.
4. Select the downloaded ZIP and wait for CurseForge to create the profile.
5. Launch the imported profile and follow the playtest channel instructions.

## Future Minecraft Mod Bridge

Backend-ready service files are included:

- `src/services/sparkReportService.ts`
- `src/services/playtestSessionService.ts`
- `src/types/playtest.ts`
- `src/types/spark.ts`

Future flow:

1. Player runs an in-game command like `/wo playtest start`.
2. The Minecraft mod creates a playtest session through a backend API.
3. Player runs Spark manually or the mod gives Spark command instructions.
4. Player submits the Spark link in-game or through Discord.
5. Backend sends the report to the Discord bot service layer.
6. Bot posts the report in the correct Discord channel.

Do not ship the Discord bot token in a mod jar, config file, resource pack, or client-side script.

## Crash Signature Detection

The parser looks for common Minecraft modpack crash causes:

- Wrong Java version
- Missing mod
- Duplicate mod
- Wrong NeoForge/Forge version
- Client/server mod mismatch
- Out of memory
- Entity ticking crash
- World generation crash
- Datapack loading error
- Mixin conflict
- Renderer/OpenGL/GPU issue
- Structure generation issue
- Wilderness Oddesy mod/API crash signatures

## Future Expansion

- Backend API endpoint for in-game bug reports.
- Discord webhook queue for backend-originated reports.
- GitHub issue sync.
- Web dashboard.
- Explicit opt-in anonymous telemetry.
- Automatic crash signature grouping.
