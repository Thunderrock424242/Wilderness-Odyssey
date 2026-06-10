import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { listChangelogEntries } from '../services/knownIssuesService';
import { changelogEmbed } from '../utils/embeds';

export const changelogCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('changelog')
    .setDescription('Show recent Wilderness Oddesy changelog entries.'),
  async execute(interaction) {
    await interaction.reply({
      embeds: [changelogEmbed(listChangelogEntries())]
    });
  }
};
