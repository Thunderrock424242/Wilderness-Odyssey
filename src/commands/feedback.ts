import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { beginFeedbackReport } from '../services/reportService';

export const feedbackCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('feedback')
    .setDescription('Submit general Wilderness Oddesy playtesting feedback.')
    .addStringOption((option) =>
      option
        .setName('category')
        .setDescription('Choose the feedback category.')
        .setRequired(true)
        .addChoices(
          { name: 'Balance', value: 'Balance' },
          { name: 'Performance', value: 'Performance' },
          { name: 'Crash', value: 'Crash' },
          { name: 'Bug', value: 'Bug' },
          { name: 'Lore confusion', value: 'Lore confusion' },
          { name: 'Structure issue', value: 'Structure issue' },
          { name: 'Entity issue', value: 'Entity issue' },
          { name: 'Progression issue', value: 'Progression issue' },
          { name: 'Suggestion', value: 'Suggestion' },
          { name: 'Fun factor', value: 'Fun factor' },
          { name: 'Difficulty', value: 'Difficulty' },
          { name: 'Exploration pacing', value: 'Exploration pacing' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('modpack_version')
        .setDescription('Optional modpack version.')
        .setMaxLength(100)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('playtest_session')
        .setDescription('Optional playtest session ID, like WO-TEST-0001.')
        .setMaxLength(40)
        .setRequired(false)
    ),
  async execute(interaction) {
    await beginFeedbackReport(interaction);
  }
};
