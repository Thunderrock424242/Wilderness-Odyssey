# Set up the Wilderness Odyssey bot

Start with community support, then enable playtesting and connected services when you need them. The bot runs on Node.js 22.x on Kinetic Hosting. Keep the existing hosting startup command and MAIN_FILE setting.

## 1. Create the Discord application

In the [Discord Developer Portal](https://discord.com/developers/applications), create an application and its bot. Copy the bot token and application ID. Enable **Message Content Intent** on the Bot page: guided reports read player answers, and the current bot requests this intent at startup.

Invite the bot with the `bot` and `applications.commands` scopes. In Discord, enable Developer Mode so you can copy server, channel, category, and role IDs.

## 2. Make a small support layout

| Discord resource | Environment setting | Purpose |
| --- | --- | --- |
| Public text channel, such as #support | `SUPPORT_CHANNEL_ID` | Player support hub |
| Support staff role | `SUPPORT_TEAM_ROLE_ID` | Private ticket access and report alerts |
| Private support category | `SUPPORT_TICKET_CATEGORY_ID` | Guided report channels and staff tickets |
| Private staff text channel | `STAFF_LOG_CHANNEL_ID` | Staff actions and ticket transcripts |
| Public issues forum | `ISSUES_FORUM_CHANNEL_ID` | Bug, crash, and performance reports |
| Public ideas forum | `IDEAS_FORUM_CHANNEL_ID` | Feedback and suggestions |

Create the issues forum tags **Bug**, **Crash**, **Performance Issues**, **Confirmed**, and **Solved**. Create **Feedback** and **Suggestion** in the ideas forum. You can change their names through the matching `*_FORUM_TAG` settings in `.env.example`.

If your server uses text channels instead of forums, fill the fallback report channel IDs in `.env.example`. Each report category needs a destination.

## 3. Configure access

Allow the bot **View Channel**, **Send Messages**, **Embed Links**, and **Read Message History** in the channels it uses. Forum posts also need **Send Messages in Threads**. Allow **Attach Files** where crash logs and staff transcripts are delivered.

Allow **Manage Channels** for private tickets and playtest channel creation. Keep the support category and staff log private. The bot creates explicit private ticket permissions for the player, bot, and configured support role.

Staff controls also check permissions when used. `/setup` follows the existing staff rule: Administrator, Manage Server, or Moderate Members. Website dashboard enrollment remains limited to the caller's effective Administrator/server-owner authorization.

## 4. Set environment variables

For local development, copy `.env.example` to `.env`. On Kinetic, store secrets in the host's environment settings. Fill `DISCORD_TOKEN`, `CLIENT_ID`, `GUILD_ID`, and the support settings above. Use copied numeric IDs, not channel or role names.

Set the recommended pack version, Java version, and RAM through `LATEST_MODPACK_VERSION`, `RECOMMENDED_JAVA_VERSION`, and `RECOMMENDED_RAM`.

Preserve the SQLite database and its configured `DATABASE_PATH` when updating or moving hosts. For a new install, initialize the bot with connected services disabled before enabling them. Existing connected-service installs intentionally refuse to start with a missing database, protecting saved restrictions and identity records.

## 5. Build, register, and check

Use the repository scripts:

```sh
npm ci
npm run check
npm test
npm run build
npm run deploy
npm start
```

`npm run deploy` updates Discord commands. Run it again after adding commands such as `/setup`; a successful build alone does not register commands. For Kinetic, use the existing production launch configuration after uploading the built bot.

As staff, run `/setup` in #support. Results are private:

| Result | Meaning |
| --- | --- |
| OK | The checked setting or permission is available |
| MISSING | Fix the named setting, channel type, or permission |
| WARN | Review a recommendation or a setting that needs manual confirmation |
| OFF | An optional feature is not configured |

Use `/setup section:channels` for routing and tags, `section:permissions` for the current channel, `section:qa` for Q&A, or `section:playtest` for test-build routing and verification. Full checks remind you to confirm the Developer Portal intent setting; the bot cannot inspect that toggle through these checks.

Run `/supportpanel` to post the player support hub. `panel_type:all` also posts info and playtest panels; use this once those features are ready. Existing posted panels retain their old text until staff replaces them.

## Optional features

- **Q&A:** Set `QA_FORUM_CHANNEL_ID` and `QA_ALERT_CHANNEL_ID`. The bot needs to send replies and embeds in Q&A, as well as read questions.
- **Playtests:** Configure the playtest session channel, category, and Spark channel. Set up Minecraft verification before requiring verified testers.
- **Verification relay:** Configure the private relay channel, exact trusted webhook ID, and `GUILD_ID`. The relay reads trusted server messages and sends confirmation cards.
- **Trusted verification API:** Follow the authenticated server setup in [connected services](connected-services.md). Never place service credentials in a player client.
- **Server status, Aether, and website access:** Follow [connected services](connected-services.md), [Aether Core](aether-core.md), and [Discord admin authentication](discord-admin-auth.md). These are separately configured integrations.

Players can start with `/help`: Report bug, Crash help, and Ask staff buttons open the existing guided flows. Reports start in private channels; their final archive posts may be public. Saved reports retain their IDs even if archive delivery fails.
