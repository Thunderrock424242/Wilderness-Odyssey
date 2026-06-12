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
- In configured Q&A channels, the bot reads question messages so it can answer known support topics or forward unknown questions to the Q&A team.
- The bot stores submitted Spark viewer links, but does not scrape private Spark data or run Minecraft commands.
- A future Minecraft companion mod must call a small backend API/webhook endpoint. Never put the Discord bot token inside a Minecraft mod.

## Setup

1. Create a Discord application at the [Discord Developer Portal](https://discord.com/developers/applications).
2. Open the application, create a bot, and copy the bot token.
3. Copy `.env.example` to `.env`.
4. Fill in `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, channel IDs, and support/status values.
5. Invite the bot with OAuth2 scopes:
   - `bot`
   - `applications.commands`
6. If using Q&A auto-responses, enable Message Content Intent for the bot in the Discord Developer Portal.
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
2. Fill the support hub values: `SUPPORT_CHANNEL_ID`, `SUPPORT_TEAM_ROLE_ID`, and `SUPPORT_TICKET_CATEGORY_ID`.
3. Fill the forum IDs: `ISSUES_FORUM_CHANNEL_ID` and `IDEAS_FORUM_CHANNEL_ID`.
4. Make sure your Discord forum tags match `BUG_FORUM_TAG`, `BUG_CONFIRMED_FORUM_TAG`, `BUG_SOLVED_FORUM_TAG`, `CRASH_FORUM_TAG`, `FEEDBACK_FORUM_TAG`, and `SUGGESTION_FORUM_TAG`.
5. Fill report/playtest channels: `PERFORMANCE_REPORTS_CHANNEL_ID`, `SPARK_REPORTS_CHANNEL_ID`, `PLAYTEST_SESSIONS_CHANNEL_ID`, and `PLAYTEST_CATEGORY_ID`.
6. Leave optional Q&A, status text, policy links, and Minecraft verification values blank until you are ready to use those features.

For every Discord channel, category, forum, server, or role value, paste the copied Discord ID number. Do not use `#channel-name` or `@role-name` for ID fields.

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
- `/privacy` - explains what the bot collects and what it avoids.
- `/bugreport` - opens a modal and saves a structured bug report as `WO-BUG-0001`; supports Minecraft/loader version, repeatability, special-content context, screenshots, optional redacted log attachment, optional Spark link, and optional playtest session link.
- `/suggest` - opens a suggestion modal, saves as `WO-SUG-0001`, posts to the suggestions channel, and adds Upvote, Downvote, and Needs discussion buttons.
- `/feedback` - opens a feedback modal with playtesting categories and optional playtest session link.
- `/crash` - accepts `.txt` or `.log`, redacts it, detects common crash signatures, saves as `WO-CRASH-0001`, and can link to a playtest session.
- `/performance` - shows performance reporting guidance.
- `/perfreport` - optional structured performance report saved as `WO-PERF-0001`.
- `/sparkreport` - validates and archives a Spark viewer/report URL as `WO-SPARK-0001`, linked to a playtest session.
- `/minecraft link` - creates a one-time Minecraft verification code for in-game `/wo link`.
- `/minecraft status` - shows the linked Minecraft account.
- `/minecraft unlink` - removes the linked Minecraft account.
- `/playtest start` - creates `WO-TEST-0001` and gives Spark profiling instructions.
- `/playtest end` - ends a playtest session and posts a summary.
- `/playtest checklist` - shows the singleplayer stability checklist.
- `/knownissues` - shows staff-configured known issues.
- `/changelog` - shows recent changelog entries.
- `/status` - shows modpack version, Java/RAM recommendations, support channels, unstable features, and server status placeholder.

## Panels

Staff can run `/supportpanel` in a channel to post persistent button/menu panels. Use `panel_type:all` to post the player-facing support, info, and playtest panels together.

Recommended server layout:

- Put the public support hub in an Information, Start Here, or Welcome category.
- Put bug/crash and feedback/suggestion forums in a Support or Triage category.
- Put private Other Help ticket channels in a staff/private support category through `SUPPORT_TICKET_CATEGORY_ID`.

For Discord forum channels, set `ISSUES_FORUM_CHANNEL_ID` for shared bug/crash posts and `IDEAS_FORUM_CHANNEL_ID` for shared feedback/suggestion posts. The bot applies the configured forum tags, defaulting to `Bug`, `Crash`, `Feedback`, and `Suggestion`. Bug threads can also use status tags, defaulting to `Confirmed` and `Solved`, when staff marks the bug as confirmed or solved from inside the forum thread.

Set `SUPPORT_TEAM_ROLE_ID` to the staff/support role that should be pinged on new bug, crash, feedback, and suggestion posts. The same role gets access to private Other Help tickets.

Panel types:

- Support intake - report bugs, crashes/logs, feedback, performance, suggestions, playtest help, and Q&A.
- Player info center - status, known issues, changelog, privacy, and command map.
- Playtest center - start a tester session, view checklist, get ZIP/Spark guidance, and open report forms.
- Staff console - staff-only reference for report lookup, statuses, known issues, changelog, playtest publishing, and Q&A handoffs.
- Setup doctor - staff-only config, channel, and permission health checks.
- All player panels - posts support intake, player info, and playtest center.

Support intake buttons:

- Gameplay bug - opens a basic bug report modal.
- Crash or log - tells the player to use `/crash` with a `.txt` or `.log` attachment.
- Playtest feedback - opens a feedback modal.
- Suggestion - opens a suggestion modal.
- Other help - creates a private staff ticket for anything that does not fit the report buttons.

More support options:

- Performance issue - opens a performance report modal.
- Playtest help - explains playtest ZIP acceptance, `/playtest start`, and report linking.
- Q&A question - points players to configured Q&A channels.

Panel-submitted bug reports do not collect screenshots or logs because Discord buttons/menus cannot request attachments. Players who need attachments should use `/bugreport` or `/crash`.

Playtest panel sessions create normal `WO-TEST-0001` records, so later bug reports, feedback, crashes, performance reports, and Spark reports can still be linked to the tester session.

Report receipts include an `Add more info` button so the submitter can append details later. Staff report posts include a `Claim / Reassign` button for bug, crash, performance, and Spark reports.

## Q&A Channels

Set `QA_CHANNEL_IDS` to the channels where the bot should watch for questions. The bot answers known support topics such as Java, RAM, crashes, bugs, performance, Spark, CurseForge ZIP import, and known issues. If it does not have a confident canned answer, it stores the question as `WO-QA-0001` and forwards it to `QA_TEAM_CHANNEL_ID`, optionally mentioning `QA_TEAM_ROLE_ID`.

Staff can add reusable canned answers with `/staff qa add`. Each answer has comma-separated trigger terms, a title, and answer text. Use `/staff qa list` to review recent entries and `/staff qa remove <id>` to disable one.

## Minecraft Verification

Minecraft verification links a Discord user to a Minecraft player without putting a Discord token or shared secret in the playtest client.

Flow:

1. Player runs `/minecraft link` in Discord.
2. The bot gives a one-time code that expires after `MINECRAFT_VERIFY_CODE_TTL_MINUTES`.
3. Player runs `/wo link <code>` in the playtest client.
4. The Wilderness Oddesy API mod sends the code, Minecraft UUID, and Minecraft name to the bot API.
5. The bot stores the link in `minecraft_links`.

Enable the API on the Discord bot host:

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

Do not include `/api/minecraft/verify` in `verification.apiBaseUrl`; the mod appends that endpoint path itself.

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

Staff commands require administrator, manage server, or moderator permissions.

- `/supportpanel` - posts support/info/playtest/staff button/menu panels.
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
- `/staff qa list`
- `/staff qa remove <id>`
- `/staff report view <id>`
- `/staff report search <keyword>`
- `/playtest publish` - staff-only: creates a public playtest channel, posts a terms/privacy acceptance gate, and privately sends the playtest ZIP link plus CurseForge import steps after acceptance.
- `/playtest list`
- `/playtest view <session_id>`

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

1. Verify your Minecraft account with `/minecraft link`, then `/wo link CODE` in the playtest client.
2. Run `/playtest start`.
3. Start Minecraft and load into the test world.
4. If testing server TPS or world lag, run Spark during the lag period.
5. For servers, use `/spark profiler start --timeout 120`.
6. For Forge/Fabric client installs, Spark may use `/sparkc` instead of `/spark`.
7. After Spark finishes, copy the Spark viewer link.
8. Submit it with `/sparkreport`.

## Staff Playtest Package Flow

Use `/playtest publish` when a dev wants to distribute a closed playtest build.

1. Staff runs `/playtest publish` with the playtest title, modpack version, focus, expected duration, and CurseForge export ZIP.
2. The bot creates a new playtest channel in `PLAYTEST_CATEGORY_ID` when configured, otherwise in the current channel category.
3. The bot posts the playtest instructions and an acceptance button.
4. Players verify their Minecraft account with `/minecraft link`, then `/wo link CODE` in the playtest client.
5. Players can read the terms/privacy notice before clicking `I accept terms and privacy`.
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
