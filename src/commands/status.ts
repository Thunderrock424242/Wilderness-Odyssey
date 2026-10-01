import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { config } from '../config';
import { connectedStatusEmbed } from './connected/status';

export const statusCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Show the current Wilderness Oddesy support/status page.'),
  async execute(interaction) {
    const supportChannel = config.channelIds.support ? `<#${config.channelIds.support}>` : config.status.supportChannels.join(', ');
    const embed = connectedStatusEmbed()
      .addFields(
        { name: 'Recommended modpack version', value: config.status.latestModpackVersion, inline: true },
        { name: 'Recommended Java', value: config.status.recommendedJavaVersion, inline: true },
        { name: 'Recommended RAM', value: config.status.recommendedRam, inline: true },
        { name: 'Support channels', value: supportChannel },
        { name: 'Known unstable features', value: config.status.knownUnstableFeatures.join(', ') || 'None configured' }
      );

    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
