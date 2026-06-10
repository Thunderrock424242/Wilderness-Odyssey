import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { beginSuggestion } from '../services/suggestionService';

export const suggestCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('suggest')
    .setDescription('Submit a Wilderness Oddesy modpack suggestion.')
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('Choose a suggestion category.')
        .setRequired(true)
        .addChoices(
          { name: 'New structure', value: 'New structure' },
          { name: 'New mob', value: 'New mob' },
          { name: 'New item', value: 'New item' },
          { name: 'Balance change', value: 'Balance change' },
          { name: 'Lore idea', value: 'Lore idea' },
          { name: 'Dimension idea', value: 'Dimension idea' },
          { name: 'Performance improvement', value: 'Performance improvement' },
          { name: 'Quality of life', value: 'Quality of life' },
          { name: 'Other', value: 'Other' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('modpack_version')
        .setDescription('Optional modpack version.')
        .setMaxLength(100)
        .setRequired(false)
    ),
  async execute(interaction) {
    await beginSuggestion(interaction);
  }
};
