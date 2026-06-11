import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { config } from '../config';
import { analyzeCrashLog } from '../services/logParser';
import {
  createCrashReport,
  readTextAttachment,
  reportClaimButtons,
  reportReceiptButtons,
  sendToConfiguredChannel
} from '../services/reportService';
import { linkReportToSession } from '../services/playtestSessionService';
import { baseEmbed, crashReportEmbed } from '../utils/embeds';

export const crashCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('crash')
    .setDescription('Analyze and archive a Minecraft crash report or latest.log.')
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
    await interaction.deferReply({ ephemeral: true });

    try {
      const attachment = interaction.options.getAttachment('file', true);
      const logText = await readTextAttachment(attachment);
      const analysis = analyzeCrashLog(logText);
      const nextSteps = analysis.nextSteps.map((step) => `- ${step}`).join('\n');

      const report = createCrashReport({
        userId: interaction.user.id,
        username: interaction.user.tag,
        fileName: attachment.name,
        fileSize: attachment.size,
        redactedLog: analysis.redactedLog,
        likelyCause: analysis.likelyCause,
        confidence: `${analysis.confidence} (${Math.round(analysis.confidenceScore * 100)}%)`,
        nextSteps
      });

      const playtestSessionId = interaction.options.getString('playtest_session');
      if (playtestSessionId) {
        linkReportToSession(playtestSessionId, 'crash', report.publicId);
      }

      const posted = await sendToConfiguredChannel(interaction.client, config.channelIds.crashReports, {
        embeds: [crashReportEmbed(report)],
        components: [reportClaimButtons('crash', report.publicId)]
      });

      const embed = baseEmbed(`Crash Analysis ${report.publicId}`, 'Report received. Aether-style analysis complete.')
        .addFields(
          { name: 'Likely cause', value: analysis.likelyCause, inline: true },
          { name: 'Confidence', value: `${analysis.confidence} (${Math.round(analysis.confidenceScore * 100)}%)`, inline: true },
          { name: 'Detected signals', value: analysis.signals.join('\n').slice(0, 1024) },
          { name: 'Next steps', value: nextSteps.slice(0, 1024) }
        );

      await interaction.editReply({
        content: posted
          ? `Crash signature detected. Staff copy archived as **${report.publicId}**.`
          : `Crash signature detected. Saved locally as **${report.publicId}**. Staff channel posting is not configured yet.`,
        embeds: [embed],
        components: [reportReceiptButtons('crash', report.publicId)]
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
