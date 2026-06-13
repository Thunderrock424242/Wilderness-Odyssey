import { PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { scheduleShutdown } from '../services/runtimeService';
import { logger } from '../utils/logger';

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
        content: 'Shutdown is locked. You need administrator or manage server permissions to use this.',
        flags: 'Ephemeral'
      });
      return;
    }

    const confirmation = interaction.options.getString('confirm', true).toLowerCase();
    if (confirmation !== 'shutdown') {
      await interaction.reply({
        content: 'Shutdown cancelled. Type `shutdown` in the confirm field to stop the bot.',
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

    await interaction.reply({
      content: 'Shutdown confirmed. I am going offline now.',
      flags: 'Ephemeral'
    });
    scheduleShutdown();
  }
};
