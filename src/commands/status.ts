import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { config } from '../config';
import { connectedStatusEmbed } from './connected/status';
import { fitEmbed, truncate } from '../utils/embeds';

export function supportStatusEmbed() {
  const supportChannel = config.channelIds.support ? `<#${config.channelIds.support}>` : config.status.supportChannels.join(', ');
  return fitEmbed(connectedStatusEmbed().addFields(
    { name: 'Recommended modpack version', value: truncate(config.status.latestModpackVersion), inline: true },
    { name: 'Recommended Java', value: truncate(config.status.recommendedJavaVersion), inline: true },
    { name: 'Recommended RAM', value: truncate(config.status.recommendedRam), inline: true },
    { name: 'Support channels', value: truncate(supportChannel) },
    { name: 'Known unstable features', value: truncate(config.status.knownUnstableFeatures.join(', ') || 'None configured') },
  ));
}

export const statusCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('status')
    .setDescription('Check server availability, player counts, and recommended pack settings.'),
  async execute(interaction) {
    const embed = supportStatusEmbed();

    await interaction.reply({ embeds: [embed], allowedMentions: { parse: [] } });
  }
};
