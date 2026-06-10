import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { listKnownIssues } from '../services/knownIssuesService';
import { knownIssuesEmbed } from '../utils/embeds';

export const knownIssuesCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('knownissues')
    .setDescription('Show the current Wilderness Oddesy known issues list.'),
  async execute(interaction) {
    await interaction.reply({
      embeds: [knownIssuesEmbed(listKnownIssues())]
    });
  }
};
