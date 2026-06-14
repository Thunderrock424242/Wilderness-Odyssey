import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { listKnownIssues } from '../services/knownIssuesService';
import { knownIssuesEmbed } from '../utils/embeds';

export const knownIssuesCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('knownissues')
    .setDescription('Show the current Wilderness Oddesy known issues list.')
    .addStringOption((option) =>
      option
        .setName('version')
        .setDescription('Optional modpack version filter, like 0.1.0.')
        .setMaxLength(80)
        .setRequired(false)
    ),
  async execute(interaction) {
    const version = interaction.options.getString('version');
    await interaction.reply({
      embeds: [knownIssuesEmbed(listKnownIssues(10, version))]
    });
  }
};
