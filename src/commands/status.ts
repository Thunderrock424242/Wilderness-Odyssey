import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { config } from '../config';
import { baseEmbed } from '../utils/embeds';

export const statusCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show the current Wilderness Oddesy support/status page.'),
  async execute(interaction) {
    const supportChannel = config.channelIds.support ? `<#${config.channelIds.support}>` : config.status.supportChannels.join(', ');
    const embed = baseEmbed('Support Status', 'Wilderness Oddesy systems online.')
      .addFields(
        { name: 'Latest modpack version', value: config.status.latestModpackVersion, inline: true },
        { name: 'Recommended Java', value: config.status.recommendedJavaVersion, inline: true },
        { name: 'Recommended RAM', value: config.status.recommendedRam, inline: true },
        { name: 'Support channels', value: supportChannel },
        { name: 'Known unstable features', value: config.status.knownUnstableFeatures.join(', ') || 'None configured' },
        { name: 'Server status', value: config.status.serverStatusLabel }
      );

    await interaction.reply({ embeds: [embed] });
  }
};
