# Wilderness Oddesy Discord Bot

Friendly Discord support bot for the **Wilderness Oddesy** Minecraft modpack community. It helps players submit bugs, crash logs, suggestions, feedback, optional performance reports, Spark profiler links, and organized playtesting sessions.

The personality is light in-universe support AI: helpful, calm, and a little eerie, without making support answers confusing.

## Stack

- Node.js
- TypeScript
- discord.js v14
- Slash commands
- Buttons, select menus, and modals
- SQLite with `better-sqlite3`
- `dotenv` for secrets and server configuration

## Privacy and Security

- The Discord bot token is never hardcoded.
- Secrets and channel IDs live in `.env`.
- `.env` and local SQLite files are ignored by git.
- Crash, performance, bug-log, and Spark reporting are opt-in.
- The bot does not ask for private/personal information.
- Log parsing redacts tokens, emails, IP addresses, and common local file paths before storage.
- Reports should not include chat logs, passwords, tokens, IP addresses, or personal files.
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
6. Give the bot permission to send messages, embeds, and buttons in configured report channels.
7. Install dependencies:

```bash
npm install
```

8. Deploy slash commands:

```bash
npm run deploy
```

9. Start the bot:

```bash
npm run build
npm start
```

Development:

```bash
npm run dev
```

## Environment Variables

Required:

- `DISCORD_TOKEN`
- `CLIENT_ID`
- `GUILD_ID`

Recommended channels:

- `BUG_REPORTS_CHANNEL_ID`
- `CRASH_REPORTS_CHANNEL_ID`
- `FEEDBACK_CHANNEL_ID`
- `SUGGESTIONS_CHANNEL_ID`
- `SPARK_REPORTS_CHANNEL_ID`
- `PLAYTEST_SESSIONS_CHANNEL_ID`
- `STAFF_REVIEW_CHANNEL_ID`
- `SUPPORT_CHANNEL_ID`

Other useful settings:

- `LATEST_MODPACK_VERSION`
- `RECOMMENDED_JAVA_VERSION`
- `RECOMMENDED_RAM`
- `SUPPORT_CHANNELS`
- `KNOWN_UNSTABLE_FEATURES`
- `SERVER_STATUS_LABEL`
- `DATABASE_PATH`
- `MAX_LOG_BYTES`

Legacy aliases still work:

- `FEEDBACK_REPORTS_CHANNEL_ID`
- `PERFORMANCE_REPORTS_CHANNEL_ID`
- `STAFF_LOG_CHANNEL_ID`

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
- `spark_reports`
- `suggestions`
- `suggestion_votes`
- `report_links`

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
- `/playtest start` - creates `WO-TEST-0001` and gives Spark profiling instructions.
- `/playtest end` - ends a playtest session and posts a summary.
- `/playtest checklist` - shows the singleplayer stability checklist.
- `/knownissues` - shows staff-configured known issues.
- `/changelog` - shows recent changelog entries.
- `/status` - shows modpack version, Java/RAM recommendations, support channels, unstable features, and server status placeholder.

## Staff Commands

Staff commands require administrator, manage server, or moderator permissions.

- `/staff bug status <id> <status>`
- `/staff crash status <id> <status>`
- `/staff suggestion status <id> <status>`
- `/staff spark status <id> <status>`
- `/staff spark notes <id>`
- `/staff issue add`
- `/staff issue remove <id>`
- `/staff issue update <id>`
- `/staff changelog add`
- `/staff report view <id>`
- `/staff report search <keyword>`
- `/playtest list`
- `/playtest view <session_id>`

Bug statuses:

- `open`
- `investigating`
- `fixed`
- `duplicate`
- `needs_more_info`
- `wontfix`

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

Bug report embeds include staff buttons for investigating, fixed, duplicate, needs more info, and wontfix.

## Spark Playtesting Flow

The bot organizes Spark links; it does not run Minecraft commands inside a player game.

1. Run `/playtest start`.
2. Start Minecraft and load into the test world.
3. If testing server TPS or world lag, run Spark during the lag period.
4. For servers, use `/spark profiler start --timeout 120`.
5. For Forge/Fabric client installs, Spark may use `/sparkc` instead of `/spark`.
6. After Spark finishes, copy the Spark viewer link.
7. Submit it with `/sparkreport`.

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
