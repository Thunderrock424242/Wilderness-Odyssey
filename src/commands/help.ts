import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { helpPayload } from '../services/helpService';

export const helpCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('help')
    .setDescription('Show the Wilderness Oddesy support menu.'),
  async execute(interaction) {
    await interaction.reply({
      ...helpPayload(),
      ephemeral: true
    });
  }
};
