import type { Client } from 'discord.js';
import { config } from '../config';
import { sendToConfiguredChannel } from '../services/reportService';
import { baseEmbed } from '../utils/embeds';
import { logger } from '../utils/logger';

export async function handleReady(client: Client<true>): Promise<void> {
  logger.info({ bot: client.user.tag }, 'Wilderness Oddesy systems online.');

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
    logger.warn({ error }, 'Failed to send startup notice.');
  });
}

function startupWarnings(): string[] {
  const warnings: string[] = [];

  if (!config.guildId) {
    warnings.push('- `GUILD_ID` is not configured; global slash command updates may take longer.');
  }

  if (!config.forumChannels.issues && !config.channelIds.bugReports) warnings.push('- `BUG_REPORTS_CHANNEL_ID` or `ISSUES_FORUM_CHANNEL_ID` is not configured.');
  if (!config.forumChannels.issues && !config.channelIds.crashReports) warnings.push('- `CRASH_REPORTS_CHANNEL_ID` or `ISSUES_FORUM_CHANNEL_ID` is not configured.');
  if (!config.forumChannels.issues && !config.channelIds.performanceReports) warnings.push('- `PERFORMANCE_REPORTS_CHANNEL_ID` or `ISSUES_FORUM_CHANNEL_ID` is not configured.');
  if (!config.forumChannels.ideas && !config.channelIds.feedbackReports) warnings.push('- `FEEDBACK_CHANNEL_ID` or `IDEAS_FORUM_CHANNEL_ID` is not configured.');
  if (!config.channelIds.sparkReports) warnings.push('- `SPARK_REPORTS_CHANNEL_ID` is not configured.');
  if (!config.channelIds.playtestSessions) warnings.push('- `PLAYTEST_SESSIONS_CHANNEL_ID` is not configured.');
  if (!config.support.teamRoleId) warnings.push('- `SUPPORT_TEAM_ROLE_ID` is not configured; report pings and Other Help ticket staff access will be limited.');
  if (!config.channelIds.supportTicketCategory) warnings.push('- `SUPPORT_TICKET_CATEGORY_ID` is recommended so Other Help tickets do not appear in the hub category.');

  if (config.qa.channelIds.length > 0 && !config.qa.teamChannelId) {
    warnings.push('- `QA_CHANNEL_IDS` is configured, but `QA_TEAM_CHANNEL_ID` is missing.');
  }

  if (config.minecraftVerification.relayChannelId) {
    if (!config.minecraftVerification.relayWebhookId) {
      warnings.push('- Minecraft verification server relay is enabled, but `MINECRAFT_VERIFY_RELAY_WEBHOOK_ID` is not set; keep the relay channel private.');
    }
  } else if (!config.minecraftVerification.apiEnabled) {
    warnings.push('- Minecraft verification is not configured; enable the server relay or client API path before requiring verified playtesters.');
  } else if (!config.minecraftVerification.publicBaseUrl) {
    warnings.push('- Minecraft verification API is enabled, but `MINECRAFT_VERIFY_PUBLIC_URL` is not configured.');
  }

  return warnings;
}
