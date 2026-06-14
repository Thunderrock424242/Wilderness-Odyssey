import { PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { scheduleShutdown } from '../services/runtimeService';
import { logger } from '../utils/logger';
import { postStaffLog } from '../services/staffLogService';

function canShutdownBot(interaction: Parameters<SlashCommand['execute']>[0]): boolean {
  const permissions = interaction.memberPermissions;
  if (!permissions) {
    return false;
  }

  return permissions.has(PermissionsBitField.Flags.Administrator)
    || permissions.has(PermissionsBitField.Flags.ManageGuild);
}

export const shutdownCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('shutdown')
    .setDescription('Admin-only: safely shut down the bot process.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ManageGuild)
    .addStringOption((option) =>
      option
        .setName('confirm')
        .setDescription('Type shutdown to confirm.')
        .setMinLength(8)
        .setMaxLength(8)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('reason')
        .setDescription('Optional note for the shutdown log.')
        .setMaxLength(200)
        .setRequired(false)
    ),
  async execute(interaction) {
    if (!canShutdownBot(interaction)) {
      await interaction.reply({
        content: 'Shutdown is staff-only. You need administrator or manage server permissions to use this.',
        flags: 'Ephemeral'
      });
      return;
    }

    const confirmation = interaction.options.getString('confirm', true).toLowerCase();
    if (confirmation !== 'shutdown') {
      await interaction.reply({
        content: 'No problem, I did not shut down. Type `shutdown` in the confirm field when you really want me to go offline.',
        flags: 'Ephemeral'
      });
      return;
    }

    const reason = interaction.options.getString('reason')?.trim() || null;
    logger.warn({
      requestedBy: interaction.user.id,
      guildId: interaction.guildId,
      channelId: interaction.channelId,
      reason
    }, 'Bot shutdown requested from Discord command.');

    const requestLogged = await postStaffLog(interaction.client, {
      title: 'Shutdown Requested',
      description: 'A staff member requested the bot process shut down.',
      fields: [
        { name: 'Requested by', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
        { name: 'Channel', value: `<#${interaction.channelId}>`, inline: true },
        { name: 'Reason', value: reason ?? 'No reason provided.' }
      ]
    });

    await interaction.reply({
      content: requestLogged
        ? 'Shutdown confirmed and logged. I am going offline now.'
        : 'Shutdown confirmed, but I could not post to `STAFF_LOG_CHANNEL_ID`. Please check that channel ID and my Send Messages permission.',
      flags: 'Ephemeral'
    });
    scheduleShutdown(0, 750, {
      source: '/shutdown',
      requestedBy: interaction.user.id,
      requestedByTag: interaction.user.tag,
      channelId: interaction.channelId,
      reason
    });
  }
};
