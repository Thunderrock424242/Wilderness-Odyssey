import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { beginCrashReportIntakeFromCommand } from '../services/reportIntakeService';

export const crashCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('crash')
    .setDescription('Analyze a crash log and create a redacted Crash forum report.')
    .addAttachmentOption((option) =>
      option
        .setName('file')
        .setDescription('Attach a `.txt` crash report or `.log` latest.log file.')
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
    await beginCrashReportIntakeFromCommand(interaction);
  }
};
