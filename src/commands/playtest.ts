import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { config } from '../config';
import {
  createPlaytestSession,
  endPlaytestSession,
  getPlaytestSession,
  listLinkedReports,
  listRecentPlaytestSessions
} from '../services/playtestSessionService';
import { sendToConfiguredChannel } from '../services/reportService';
import { requireStaff } from '../utils/permissions';
import { baseEmbed, playtestListEmbed, playtestSessionEmbed } from '../utils/embeds';

const yesNoChoices = [
  { name: 'Yes', value: 'Yes' },
  { name: 'No', value: 'No' },
  { name: 'Not sure', value: 'Not sure' }
] as const;

export const playtestCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('playtest')
    .setDescription('Manage Wilderness Oddesy playtesting sessions.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('start')
        .setDescription('Start a new playtesting session.')
        .addStringOption((option) =>
          option
            .setName('tester_name')
            .setDescription('Tester name or handle.')
            .setMaxLength(100)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('modpack_version')
            .setDescription('Modpack version being tested.')
            .setMaxLength(100)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('test_type')
            .setDescription('What kind of playtest is this?')
            .setRequired(true)
            .addChoices(
              { name: 'New world test', value: 'New world test' },
              { name: 'Structure test', value: 'Structure test' },
              { name: 'Rift/anomaly test', value: 'Rift/anomaly test' },
              { name: 'Entity test', value: 'Entity test' },
              { name: 'Dimension test', value: 'Dimension test' },
              { name: 'Multiplayer server test', value: 'Multiplayer server test' },
              { name: 'General survival test', value: 'General survival test' }
            )
        )
        .addStringOption((option) =>
          option
            .setName('expected_duration')
            .setDescription('Expected test duration, like 30 minutes or 2 hours.')
            .setMaxLength(100)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('notes')
            .setDescription('Optional notes for this session.')
            .setMaxLength(1000)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('end')
        .setDescription('End a playtesting session and post a summary.')
        .addStringOption((option) =>
          option
            .setName('session_id')
            .setDescription('Playtest session ID, like WO-TEST-0001.')
            .setMaxLength(40)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('successful')
            .setDescription('Was the test successful?')
            .setRequired(true)
            .addChoices(...yesNoChoices)
        )
        .addStringOption((option) =>
          option
            .setName('crashes')
            .setDescription('Any crashes?')
            .setRequired(true)
            .addChoices(...yesNoChoices)
        )
        .addStringOption((option) =>
          option
            .setName('major_lag')
            .setDescription('Any major lag?')
            .setRequired(true)
            .addChoices(...yesNoChoices)
        )
        .addStringOption((option) =>
          option
            .setName('bugs_found')
            .setDescription('Any bugs found?')
            .setRequired(true)
            .addChoices(...yesNoChoices)
        )
        .addStringOption((option) =>
          option
            .setName('spark_reports_attached')
            .setDescription('Were Spark reports attached?')
            .setRequired(true)
            .addChoices(...yesNoChoices)
        )
        .addIntegerOption((option) =>
          option
            .setName('rating')
            .setDescription('Overall rating from 1 to 10.')
            .setMinValue(1)
            .setMaxValue(10)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('final_notes')
            .setDescription('Optional final notes.')
            .setMaxLength(1000)
            .setRequired(false)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('list')
        .setDescription('Staff-only: list recent playtesting sessions.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('view')
        .setDescription('Staff-only: view one playtesting session.')
        .addStringOption((option) =>
          option
            .setName('session_id')
            .setDescription('Playtest session ID, like WO-TEST-0001.')
            .setMaxLength(40)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('checklist')
        .setDescription('Show the singleplayer stability checklist.')
    ),
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'start') {
      const session = createPlaytestSession({
        userId: interaction.user.id,
        username: interaction.user.tag,
        testerName: interaction.options.getString('tester_name', true),
        modpackVersion: interaction.options.getString('modpack_version', true),
        testType: interaction.options.getString('test_type', true),
        expectedDuration: interaction.options.getString('expected_duration', true),
        notes: interaction.options.getString('notes')
      });

      await sendToConfiguredChannel(interaction.client, config.channelIds.playtestSessions, {
        embeds: [playtestSessionEmbed(session)]
      });

      await interaction.reply({
        content: [
          `Playtest session created. Wilderness Oddesy systems are watching for instability. Session ID: **${session.publicId}**.`,
          '',
          'Start Minecraft and load into the test world.',
          'If testing server TPS or world lag, run Spark profiler during the lag period.',
          'For servers, use `/spark profiler start --timeout 120`.',
          'For Forge/Fabric client installs, Spark may use `/sparkc` instead of `/spark`.',
          'After Spark finishes, copy the Spark viewer link and submit it with `/sparkreport`.'
        ].join('\n'),
        ephemeral: true
      });
      return;
    }

    if (subcommand === 'end') {
      const sessionId = interaction.options.getString('session_id', true);
      const session = endPlaytestSession(sessionId, {
        successful: interaction.options.getString('successful', true),
        crashes: interaction.options.getString('crashes', true),
        majorLag: interaction.options.getString('major_lag', true),
        bugsFound: interaction.options.getString('bugs_found', true),
        sparkReportsAttached: interaction.options.getString('spark_reports_attached', true),
        rating: interaction.options.getInteger('rating', true),
        finalNotes: interaction.options.getString('final_notes')
      });

      if (!session) {
        await interaction.reply({ content: `No playtest session found for ${sessionId}.`, ephemeral: true });
        return;
      }

      const links = listLinkedReports(session.publicId);
      await sendToConfiguredChannel(interaction.client, config.channelIds.playtestSessions, {
        embeds: [playtestSessionEmbed(session, links)]
      });

      await interaction.reply({
        content: `Playtest session **${session.publicId}** ended and summarized.`,
        ephemeral: true
      });
      return;
    }

    if (subcommand === 'list') {
      if (!(await requireStaff(interaction))) {
        return;
      }

      await interaction.reply({
        embeds: [playtestListEmbed(listRecentPlaytestSessions())],
        ephemeral: true
      });
      return;
    }

    if (subcommand === 'view') {
      if (!(await requireStaff(interaction))) {
        return;
      }

      const sessionId = interaction.options.getString('session_id', true);
      const session = getPlaytestSession(sessionId);
      if (!session) {
        await interaction.reply({ content: `No playtest session found for ${sessionId}.`, ephemeral: true });
        return;
      }

      await interaction.reply({
        embeds: [playtestSessionEmbed(session, listLinkedReports(session.publicId))],
        ephemeral: true
      });
      return;
    }

    const checklist = [
      'Create a new world.',
      'Play for 30 minutes.',
      'Visit normal overworld terrain.',
      'Visit a structure.',
      'Enter or approach rift/anomaly content.',
      'Fight custom mobs.',
      'Test custom items.',
      'Sleep.',
      'Die and respawn.',
      'Check FPS.',
      'Report bugs, crashes, feedback, or Spark profiles with the matching commands.'
    ];

    await interaction.reply({
      embeds: [
        baseEmbed('Playtesting Checklist', 'Singleplayer stability route for brave testers.')
          .addFields({ name: 'Checklist', value: checklist.map((item) => `- ${item}`).join('\n') })
      ],
      ephemeral: true
    });
  }
};
