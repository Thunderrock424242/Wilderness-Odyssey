import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { config } from '../config';
import { readTextAttachment, sendToConfiguredChannel } from '../services/reportService';
import { createSparkReport, isSparkReportUrl } from '../services/sparkReportService';
import { getPlaytestSession } from '../services/playtestSessionService';
import { redactLog } from '../services/logParser';
import { sparkReportEmbed } from '../utils/embeds';

export const sparkReportCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('sparkreport')
    .setDescription('Attach a Spark profiler result to a Wilderness Oddesy playtest session.')
    .addStringOption((option) =>
      option
        .setName('session_id')
        .setDescription('Playtest session ID, like WO-TEST-0001.')
        .setMaxLength(40)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('spark_url')
        .setDescription('Spark viewer/report URL.')
        .setMaxLength(300)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('activity')
        .setDescription('What were you doing during the profile?')
        .setMaxLength(1000)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('location')
        .setDescription('Location or dimension during the profile.')
        .setMaxLength(300)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('suspected_area')
        .setDescription('Where did lag seem to happen?')
        .setRequired(true)
        .addChoices(
          { name: 'Rift', value: 'Rift' },
          { name: 'Anomaly', value: 'Anomaly' },
          { name: 'Cryo facility', value: 'Cryo facility' },
          { name: 'Structure', value: 'Structure' },
          { name: 'Custom mob', value: 'Custom mob' },
          { name: 'Particle accelerator', value: 'Particle accelerator' },
          { name: 'Custom dimension', value: 'Custom dimension' },
          { name: 'Heavy worldgen', value: 'Heavy worldgen' },
          { name: 'Unknown', value: 'Unknown' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('ram_allocated')
        .setDescription('RAM allocated, like 8 GB.')
        .setMaxLength(80)
        .setRequired(true)
    )
    .addIntegerOption((option) =>
      option
        .setName('render_distance')
        .setDescription('Render distance in chunks.')
        .setMinValue(2)
        .setMaxValue(64)
        .setRequired(true)
    )
    .addStringOption((option) =>
      option
        .setName('shader_status')
        .setDescription('Were shaders enabled?')
        .setRequired(true)
        .addChoices(
          { name: 'Shaders on', value: 'On' },
          { name: 'Shaders off', value: 'Off' },
          { name: 'Not sure', value: 'Not sure' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('symptoms')
        .setDescription('Optional symptoms, like freezes, TPS drops, or chunk stutter.')
        .setMaxLength(1000)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('fps_average')
        .setDescription('Optional FPS average, if known.')
        .setMaxLength(80)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('tps_mspt')
        .setDescription('Optional TPS/MSPT, if known.')
        .setMaxLength(80)
        .setRequired(false)
    )
    .addAttachmentOption((option) =>
      option
        .setName('latest_log')
        .setDescription('Optional latest.log; redacted before storage.')
        .setRequired(false)
    ),
  async execute(interaction) {
    await interaction.deferReply({ ephemeral: true });

    try {
      const sparkUrl = interaction.options.getString('spark_url', true);
      if (!isSparkReportUrl(sparkUrl)) {
        await interaction.editReply('That does not look like a Spark viewer/report URL. Please submit a public Spark viewer link.');
        return;
      }

      const latestLog = interaction.options.getAttachment('latest_log');
      let redactedLog: string | null = null;
      if (latestLog) {
        redactedLog = redactLog(await readTextAttachment(latestLog)).slice(0, 120_000);
      }

      const sessionId = interaction.options.getString('session_id', true);
      const report = createSparkReport({
        sessionPublicId: sessionId,
        userId: interaction.user.id,
        username: interaction.user.tag,
        sparkUrl,
        activity: interaction.options.getString('activity', true),
        symptoms: interaction.options.getString('symptoms'),
        location: interaction.options.getString('location', true),
        suspectedArea: interaction.options.getString('suspected_area', true),
        fpsAverage: interaction.options.getString('fps_average'),
        tpsMspt: interaction.options.getString('tps_mspt'),
        ramAllocated: interaction.options.getString('ram_allocated', true),
        renderDistance: interaction.options.getInteger('render_distance', true),
        shaderStatus: interaction.options.getString('shader_status', true),
        latestLogName: latestLog?.name ?? null,
        redactedLog
      });

      const session = getPlaytestSession(report.sessionPublicId);
      const posted = await sendToConfiguredChannel(interaction.client, config.channelIds.sparkReports, {
        embeds: [sparkReportEmbed(report, session)]
      });

      await interaction.editReply(
        `Spark report archived. Performance anomaly logged. Report ID: **${report.publicId}**.${posted ? '' : ' Spark report channel posting is not configured yet, but the report was saved locally.'}`
      );
    } catch (error) {
      await interaction.editReply(error instanceof Error ? error.message : 'Could not archive that Spark report.');
    }
  }
};
