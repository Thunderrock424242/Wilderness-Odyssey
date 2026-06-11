import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  ChannelType,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionsBitField,
  SlashCommandBuilder,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import type { SlashCommand } from '../types';
import { config } from '../config';
import {
  createPlaytestRelease,
  getPlaytestRelease,
  recordPlaytestReleaseAcceptance,
  updatePlaytestReleaseMessage
} from '../services/playtestReleaseService';
import {
  createPlaytestSession,
  endPlaytestSession,
  getPlaytestSession,
  listLinkedReports,
  listRecentPlaytestSessions
} from '../services/playtestSessionService';
import { getMinecraftLinkByUserId } from '../services/minecraftVerificationService';
import { sendToConfiguredChannel } from '../services/reportService';
import { requireStaff } from '../utils/permissions';
import { baseEmbed, playtestListEmbed, playtestReleaseEmbed, playtestSessionEmbed } from '../utils/embeds';

const acceptReleasePrefix = 'playtest-release:accept:';
const playtestPanelStartPrefix = 'playtest-panel:start';

type PlaytestGateInteraction =
  | ButtonInteraction
  | ChatInputCommandInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction;

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
        .setName('publish')
        .setDescription('Staff-only: publish a gated playtest ZIP in a new channel.')
        .addStringOption((option) =>
          option
            .setName('title')
            .setDescription('Short playtest title.')
            .setMaxLength(100)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('modpack_version')
            .setDescription('Modpack version in the test ZIP.')
            .setMaxLength(100)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('test_focus')
            .setDescription('What players should focus on testing.')
            .setMaxLength(1000)
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('expected_duration')
            .setDescription('Expected test duration, like 30 minutes or 2 hours.')
            .setMaxLength(100)
            .setRequired(true)
        )
        .addAttachmentOption((option) =>
          option
            .setName('zip_file')
            .setDescription('CurseForge export ZIP for this playtest.')
            .setRequired(true)
        )
        .addRoleOption((option) =>
          option
            .setName('audience_role')
            .setDescription('Optional role to mention when the playtest channel is created.')
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('terms_url')
            .setDescription('Optional playtest terms URL. Falls back to PLAYTEST_TERMS_URL.')
            .setMaxLength(500)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('privacy_url')
            .setDescription('Optional privacy policy URL. Falls back to PLAYTEST_PRIVACY_URL.')
            .setMaxLength(500)
            .setRequired(false)
        )
        .addStringOption((option) =>
          option
            .setName('instructions')
            .setDescription('Optional extra tester instructions.')
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
      if (!(await requireMinecraftVerification(interaction))) {
        return;
      }

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

    if (subcommand === 'publish') {
      if (!(await requireStaff(interaction))) {
        return;
      }

      if (!interaction.guild) {
        await interaction.reply({ content: 'Playtest channels can only be created inside a Discord server.', ephemeral: true });
        return;
      }

      const botMember = interaction.guild.members.me;
      if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
        await interaction.reply({
          content: 'I need the Manage Channels permission before I can create playtest channels.',
          ephemeral: true
        });
        return;
      }

      const packageFile = interaction.options.getAttachment('zip_file', true);
      if (!packageFile.name.toLowerCase().endsWith('.zip')) {
        await interaction.reply({
          content: 'Please attach a CurseForge export ZIP. The file name should end with `.zip`.',
          ephemeral: true
        });
        return;
      }

      const title = interaction.options.getString('title', true);
      const currentParent = interaction.channel && 'parentId' in interaction.channel
        ? interaction.channel.parentId
        : null;
      const parent = config.channelIds.playtestCategory ?? currentParent ?? undefined;
      const channel = await interaction.guild.channels.create({
        name: buildPlaytestChannelName(title),
        type: ChannelType.GuildText,
        parent,
        topic: `Wilderness Oddesy playtest package for ${title}`,
        reason: `Playtest published by ${interaction.user.tag}`
      });

      const release = createPlaytestRelease({
        guildId: interaction.guild.id,
        createdBy: interaction.user.id,
        createdByUsername: interaction.user.tag,
        title,
        modpackVersion: interaction.options.getString('modpack_version', true),
        testFocus: interaction.options.getString('test_focus', true),
        expectedDuration: interaction.options.getString('expected_duration', true),
        packageName: packageFile.name,
        packageUrl: packageFile.url,
        packageSize: packageFile.size ?? null,
        termsUrl: interaction.options.getString('terms_url') ?? config.playtest.termsUrl ?? null,
        privacyUrl: interaction.options.getString('privacy_url') ?? config.playtest.privacyUrl ?? null,
        instructions: interaction.options.getString('instructions')
      });

      await channel.edit({
        name: buildPlaytestChannelName(title, release.publicId),
        topic: `${release.publicId} - Wilderness Oddesy playtest package for ${title}`,
        reason: `Playtest release ${release.publicId} published`
      });

      const audienceRole = interaction.options.getRole('audience_role');
      const audienceRoleId = audienceRole?.id;
      const message = await channel.send({
        content: audienceRoleId
          ? `<@&${audienceRoleId}> New Wilderness Oddesy playtest build is ready.`
          : 'New Wilderness Oddesy playtest build is ready.',
        embeds: [playtestReleaseEmbed(release)],
        components: [playtestAcceptRow(release.publicId)],
        allowedMentions: audienceRoleId ? { roles: [audienceRoleId] } : { parse: [] }
      });

      updatePlaytestReleaseMessage(release.publicId, {
        channelId: channel.id,
        messageId: message.id
      });

      await interaction.reply({
        content: `Published ${release.publicId} in <#${channel.id}>. Testers will receive the ZIP link only after accepting the playtest terms/privacy notice.`,
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

export async function beginPlaytestSessionFromPanel(interaction: StringSelectMenuInteraction): Promise<void> {
  if (!(await requireMinecraftVerification(interaction))) {
    return;
  }

  const modal = new ModalBuilder()
    .setCustomId(playtestPanelStartPrefix)
    .setTitle('Start Playtest Session')
    .addComponents(
      panelTextInputRow('tester_name', 'Tester name or handle', TextInputStyle.Short, true, 'Example: Mason'),
      panelTextInputRow('modpack_version', 'Modpack version', TextInputStyle.Short, true, 'Example: 0.1.0-playtest'),
      panelTextInputRow('test_type', 'Test focus', TextInputStyle.Short, true, 'Example: New world, structure, rift, multiplayer'),
      panelTextInputRow('expected_duration', 'Expected duration', TextInputStyle.Short, true, 'Example: 30 minutes or 2 hours'),
      panelTextInputRow('notes', 'Optional notes', TextInputStyle.Paragraph, false, 'Anything staff should know before you start.')
    );

  await interaction.showModal(modal);
}

export async function handlePlaytestPanelModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (interaction.customId !== playtestPanelStartPrefix) {
    return false;
  }

  if (!(await requireMinecraftVerification(interaction))) {
    return true;
  }

  const session = createPlaytestSession({
    userId: interaction.user.id,
    username: interaction.user.tag,
    testerName: interaction.fields.getTextInputValue('tester_name'),
    modpackVersion: interaction.fields.getTextInputValue('modpack_version'),
    testType: interaction.fields.getTextInputValue('test_type'),
    expectedDuration: interaction.fields.getTextInputValue('expected_duration'),
    notes: optionalPanelValue(interaction.fields.getTextInputValue('notes'))
  });

  await sendToConfiguredChannel(interaction.client, config.channelIds.playtestSessions, {
    embeds: [playtestSessionEmbed(session)]
  });

  await interaction.reply({
    content: [
      `Playtest session created: **${session.publicId}**.`,
      'Use this session ID when submitting bugs, feedback, crashes, performance reports, or Spark links.',
      'If testing lag, run Spark during the lag period and submit the viewer link from the playtest panel or `/sparkreport`.'
    ].join('\n'),
    ephemeral: true
  });

  return true;
}

export async function handlePlaytestReleaseButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith(acceptReleasePrefix)) {
    return false;
  }

  const publicId = interaction.customId.slice(acceptReleasePrefix.length);
  const release = getPlaytestRelease(publicId);
  if (!release) {
    await interaction.reply({
      content: 'That playtest package could not be found. Ask staff to republish the playtest gate.',
      ephemeral: true
    });
    return true;
  }

  if (release.status !== 'active') {
    await interaction.reply({
      content: `${release.publicId} is no longer accepting new testers.`,
      ephemeral: true
    });
    return true;
  }

  if (!(await requireMinecraftVerification(interaction))) {
    return true;
  }

  recordPlaytestReleaseAcceptance({
    releasePublicId: release.publicId,
    userId: interaction.user.id,
    username: interaction.user.tag
  });

  await interaction.reply({
    content: playtestDownloadInstructions(release),
    ephemeral: true
  });
  return true;
}

async function requireMinecraftVerification(interaction: PlaytestGateInteraction): Promise<boolean> {
  const link = getMinecraftLinkByUserId(interaction.user.id);
  if (link) {
    return true;
  }

  const configNote = config.minecraftVerification.apiEnabled
    ? config.minecraftVerification.publicBaseUrl
      ? null
      : 'Staff note: the verification API is enabled, but `MINECRAFT_VERIFY_PUBLIC_URL` is not configured yet.'
    : 'Staff note: the Minecraft verification API is disabled, so staff needs to enable it before testers can finish linking.';

  await interaction.reply({
    content: [
      'Minecraft verification is required before joining a playtest.',
      '',
      'Run `/minecraft link` in Discord to get a one-time code, then run `/wo link CODE` in the playtest client.',
      'After it links successfully, come back and try this playtest action again.',
      configNote
    ].filter(Boolean).join('\n'),
    ephemeral: true
  });

  return false;
}

function playtestAcceptRow(publicId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${acceptReleasePrefix}${publicId}`)
      .setLabel('I accept terms and privacy')
      .setStyle(ButtonStyle.Success)
  );
}

function buildPlaytestChannelName(title: string, publicId?: string): string {
  const slug = title
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, publicId ? 72 : 86);
  const base = slug || 'playtest';
  return publicId ? `${publicId.toLowerCase()}-${base}`.slice(0, 100) : `playtest-${base}`.slice(0, 100);
}

function playtestDownloadInstructions(release: {
  publicId: string;
  title: string;
  packageName: string;
  packageUrl: string;
  packageSize: number | null;
  termsUrl: string | null;
  privacyUrl: string | null;
  instructions: string | null;
}): string {
  const policy = [
    release.termsUrl ? `Terms: ${release.termsUrl}` : null,
    release.privacyUrl ? `Privacy: ${release.privacyUrl}` : null
  ].filter(Boolean);

  return [
    `Accepted for **${release.publicId}: ${release.title}**.`,
    '',
    `Download: **${release.packageName}**${release.packageSize ? ` (${formatBytes(release.packageSize)})` : ''}`,
    release.packageUrl,
    '',
    '**CurseForge import**',
    '1. Download the ZIP above. Do not unzip it.',
    '2. Open the CurseForge app and choose Minecraft.',
    '3. Choose Create Custom Profile, then use the import option for an existing ZIP/profile.',
    '4. Select the downloaded ZIP and wait for CurseForge to finish creating the profile.',
    '5. Launch that imported profile and follow the playtest instructions in the channel.',
    '',
    '**During the test**',
    'Use `/playtest start` to create your tester session, then report issues with `/bugreport`, `/crash`, `/feedback`, `/perfreport`, or `/sparkreport`.',
    release.instructions ? `\n**Staff notes**\n${release.instructions}` : null,
    policy.length > 0 ? `\n${policy.join('\n')}` : null
  ].filter(Boolean).join('\n');
}

function formatBytes(value: number): string {
  if (value < 1024) {
    return `${value} B`;
  }

  const units = ['KB', 'MB', 'GB'];
  let size = value / 1024;
  let index = 0;
  while (size >= 1024 && index < units.length - 1) {
    size /= 1024;
    index += 1;
  }

  return `${size.toFixed(size >= 10 ? 0 : 1)} ${units[index]}`;
}

function optionalPanelValue(value: string): string | null {
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

function panelTextInputRow(
  customId: string,
  label: string,
  style: TextInputStyle,
  required: boolean,
  placeholder?: string
): ActionRowBuilder<TextInputBuilder> {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required);

  if (placeholder) {
    input.setPlaceholder(placeholder);
  }

  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}
