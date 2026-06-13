import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import {
  reportReceiptButtons
} from '../services/reportService';
import { archiveCrashAttachment } from '../services/crashReportService';

export const crashCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('crash')
    .setDescription('Analyze a crash log and create a redacted Crash forum report.')
    .addAttachmentOption((option) =>
      option
        .setName('file')
        .setDescription('Attach a `.txt` crash report or `.log` latest.log file.')
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('playtest_session')
        .setDescription('Optional playtest session ID, like WO-TEST-0001.')
        .setMaxLength(40)
        .setRequired(false)
    ),
  async execute(interaction) {
    await interaction.deferReply({ flags: 'Ephemeral' });

    try {
      const attachment = interaction.options.getAttachment('file', true);
      const result = await archiveCrashAttachment({
        client: interaction.client,
        user: interaction.user,
        attachment,
        playtestSessionId: interaction.options.getString('playtest_session')
      });

      await interaction.editReply({
        content: result.posted
          ? `Crash signature detected. Staff copy archived as **${result.report.publicId}**.`
          : `Crash signature detected. Saved locally as **${result.report.publicId}**. Staff channel posting is not configured yet.`,
        embeds: [result.embed],
        components: [reportReceiptButtons('crash', result.report.publicId)]
      });
    } catch (error) {
      await interaction.editReply({
        content: error instanceof Error
          ? `I could not process that crash report: ${error.message}`
          : 'I could not process that crash report because of an unknown error.'
      });
    }
  }
};
