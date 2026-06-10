import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { privacyEmbed } from '../utils/embeds';

export const privacyCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('privacy')
    .setDescription('Explain what the bot collects and what it does not collect.'),
  async execute(interaction) {
    await interaction.reply({
      embeds: [privacyEmbed()],
      ephemeral: true
    });
  }
};
