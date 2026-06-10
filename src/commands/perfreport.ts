import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { beginPerformanceReport } from '../services/reportService';

export const perfReportCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('perfreport')
    .setDescription('Submit an optional opt-in performance report.')
    .addStringOption((option) =>
      option
        .setName('cpu_gpu')
        .setDescription('Optional CPU/GPU details, if you choose to provide them.')
        .setMaxLength(300)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('java_version')
        .setDescription('Optional Java version.')
        .setMaxLength(100)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('launcher')
        .setDescription('Optional launcher name.')
        .setMaxLength(100)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('shaders')
        .setDescription('Are shaders enabled?')
        .setRequired(false)
        .addChoices(
          { name: 'Shaders on', value: 'On' },
          { name: 'Shaders off', value: 'Off' },
          { name: 'Not sure', value: 'Not sure' }
        )
    )
    .addIntegerOption((option) =>
      option
        .setName('render_distance')
        .setDescription('Optional render distance in chunks.')
        .setMinValue(2)
        .setMaxValue(64)
        .setRequired(false)
    ),
  async execute(interaction) {
    await beginPerformanceReport(interaction);
  }
};
