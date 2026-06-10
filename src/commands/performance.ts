import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { baseEmbed } from '../utils/embeds';

export const performanceCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('performance')
    .setDescription('Show how to report Wilderness Oddesy performance issues.'),
  async execute(interaction) {
    const embed = baseEmbed(
      'Performance Help',
      'Performance reporting is optional and opt-in. Share only what you are comfortable sharing.'
    )
      .addFields(
        { name: 'Useful numbers', value: 'FPS average, RAM allocated, RAM used, CPU, GPU, Java version, and modpack version.' },
        { name: 'Graphics settings', value: 'Shaders on/off, render distance, graphics preset, and any extra client mods.' },
        { name: 'Where lag happens', value: 'Note if lag happens near structures, rifts, anomalies, custom entities, dimensions, or while generating chunks.' },
        { name: 'Submit a report', value: 'Use `/perfreport` when you want staff to archive a structured performance report.' }
      );

    await interaction.reply({ embeds: [embed], ephemeral: true });
  }
};
