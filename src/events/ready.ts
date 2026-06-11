import type { Client } from 'discord.js';
import { config } from '../config';
import { sendToConfiguredChannel } from '../services/reportService';
import { baseEmbed } from '../utils/embeds';

export async function handleReady(client: Client<true>): Promise<void> {
  console.log(`Wilderness Oddesy systems online as ${client.user.tag}.`);

  const warnings = startupWarnings();
  const targetChannel = config.channelIds.staffLog ?? config.channelIds.staffReview;
  if (!targetChannel) {
    return;
  }

  await sendToConfiguredChannel(client, targetChannel, {
    embeds: [
      baseEmbed('Bot Startup', `Wilderness Oddesy systems online as ${client.user.tag}.`)
        .addFields(
          { name: 'Panels', value: '`/supportpanel panel_type:all` posts the player panels.\n`/supportpanel panel_type:setup` posts setup checks.' },
          { name: 'Config warnings', value: warnings.length > 0 ? warnings.join('\n').slice(0, 1024) : 'No obvious config warnings.' }
        )
    ]
  }).catch((error) => {
    console.warn('Failed to send startup notice:', error);
  });
}

function startupWarnings(): string[] {
  const warnings: string[] = [];

  if (!config.guildId) {
    warnings.push('- `GUILD_ID` is not configured; global slash command updates may take longer.');
  }

  if (!config.forumChannels.issues && !config.channelIds.bugReports) warnings.push('- `BUG_REPORTS_CHANNEL_ID` or `ISSUES_FORUM_CHANNEL_ID` is not configured.');
  if (!config.forumChannels.issues && !config.channelIds.crashReports) warnings.push('- `CRASH_REPORTS_CHANNEL_ID` or `ISSUES_FORUM_CHANNEL_ID` is not configured.');
  if (!config.forumChannels.ideas && !config.channelIds.feedbackReports) warnings.push('- `FEEDBACK_CHANNEL_ID` or `IDEAS_FORUM_CHANNEL_ID` is not configured.');
  if (!config.channelIds.performanceReports) warnings.push('- `PERFORMANCE_REPORTS_CHANNEL_ID` is not configured.');
  if (!config.channelIds.sparkReports) warnings.push('- `SPARK_REPORTS_CHANNEL_ID` is not configured.');
  if (!config.channelIds.playtestSessions) warnings.push('- `PLAYTEST_SESSIONS_CHANNEL_ID` is not configured.');

  if (config.qa.channelIds.length > 0 && !config.qa.teamChannelId) {
    warnings.push('- `QA_CHANNEL_IDS` is configured, but `QA_TEAM_CHANNEL_ID` is missing.');
  }

  if (!config.playtest.termsUrl || !config.playtest.privacyUrl) {
    warnings.push('- Playtest terms/privacy URLs are recommended before gated ZIP distribution.');
  }

  if (!config.minecraftVerification.apiEnabled) {
    warnings.push('- Minecraft verification API is disabled; `/minecraft link` codes cannot be completed from the client mod yet.');
  } else if (!config.minecraftVerification.publicBaseUrl) {
    warnings.push('- Minecraft verification API is enabled, but `MINECRAFT_VERIFY_PUBLIC_URL` is not configured.');
  }

  return warnings;
}
