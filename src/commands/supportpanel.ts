import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  PermissionsBitField,
  SlashCommandBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction
} from 'discord.js';
import { RESTJSONErrorCodes } from 'discord-api-types/v10';
import type { SlashCommand } from '../types';
import { config } from '../config';
import { beginPlaytestSessionFromPanel } from './playtest';
import {
  beginFeedbackReportFromPanel
} from '../services/reportService';
import {
  beginBugReportIntakeFromPanel,
  beginCrashReportIntakeFromPanel,
  beginPerformanceReportIntakeFromPanel
} from '../services/reportIntakeService';
import {
  listChangelogEntries,
  listKnownIssues
} from '../services/knownIssuesService';
import { setupDoctorEmbed } from '../services/setupDoctorService';
import { beginSuggestionFromPanel } from '../services/suggestionService';
import { beginOtherHelpTicket } from '../services/supportTicketService';
import { postStaffLog } from '../services/staffLogService';
import { requireStaff } from '../utils/permissions';
import {
  baseEmbed,
  changelogEmbed,
  knownIssuesEmbed,
  privacyEmbed
} from '../utils/embeds';

const supportPanelCustomId = 'supportpanel:category';
const supportContinueCustomId = 'supportpanel:continue';
const supportTriageCustomId = 'supportpanel:triage';
const infoPanelCustomId = 'panel:info';
const playtestPanelCustomId = 'panel:playtest';
const staffPanelCustomId = 'panel:staff';
const setupPanelCustomId = 'panel:setup';

type SupportActionCategory =
  | 'bug'
  | 'crash'
  | 'performance'
  | 'feedback'
  | 'suggestion'
  | 'notsure'
  | 'other'
  | 'playtest'
  | 'question';

interface SupportActionPreset {
  value: SupportActionCategory;
  label: string;
  fieldTitle: string;
  fieldDescription: string;
  optionDescription: string;
}

const supportActionPresets: SupportActionPreset[] = [
  {
    value: 'bug',
    label: 'Bug report',
    fieldTitle: 'Bug report',
    fieldDescription: 'Broken gameplay, bad behavior, missing content, or reproducible issues. Opens a private guided intake channel.',
    optionDescription: 'Known-issues check, then private bug intake.'
  },
  {
    value: 'crash',
    label: 'Crash / logs',
    fieldTitle: 'Crash / logs',
    fieldDescription: 'Crash reports, latest.log, Java/loader errors, or launch failures. Opens a private guided intake channel.',
    optionDescription: 'Known-issues check, then private crash intake.'
  },
  {
    value: 'performance',
    label: 'Performance issue',
    fieldTitle: 'Performance issue',
    fieldDescription: 'Lag, FPS drops, stutter, freezes, RAM pressure, shaders, or worldgen performance.',
    optionDescription: 'Open a private performance intake.'
  },
  {
    value: 'feedback',
    label: 'Feedback',
    fieldTitle: 'Feedback',
    fieldDescription: 'Playtest impressions, balance notes, pacing, difficulty, and polish.',
    optionDescription: 'Open a feedback form.'
  },
  {
    value: 'suggestion',
    label: 'Suggestion',
    fieldTitle: 'Suggestion',
    fieldDescription: 'New ideas, quality-of-life requests, content proposals, and voting.',
    optionDescription: 'Create a suggestion with voting.'
  },
  {
    value: 'notsure',
    label: 'Help me pick',
    fieldTitle: 'Help me pick',
    fieldDescription: 'A short routing menu for players who are not sure where their issue belongs.',
    optionDescription: 'Show a guided routing menu.'
  },
  {
    value: 'other',
    label: 'Other help',
    fieldTitle: 'Other help',
    fieldDescription: 'Private staff ticket for anything that does not fit the structured report options.',
    optionDescription: 'Open a private staff ticket.'
  },
  {
    value: 'playtest',
    label: 'Playtest help',
    fieldTitle: 'Playtest help',
    fieldDescription: 'ZIP, CurseForge import, tester sessions, report linking, and Spark guidance.',
    optionDescription: 'Get ZIP, session, and Spark guidance.'
  },
  {
    value: 'question',
    label: 'Q&A question',
    fieldTitle: 'Q&A question',
    fieldDescription: 'Points players to configured Q&A channels for bot answers or team handoff.',
    optionDescription: 'Learn where to ask Q&A questions.'
  }
];

export const supportPanelCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('supportpanel')
    .setDescription('Staff-only: post clean dropdown panels for common bot workflows.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
    .addStringOption((option) =>
      option
        .setName('panel_type')
        .setDescription('Which panel should be posted?')
        .setRequired(false)
        .addChoices(
          { name: 'Support Hub', value: 'support' },
          { name: 'Player info center', value: 'info' },
          { name: 'Playtest center', value: 'playtest' },
          { name: 'Staff console', value: 'staff' },
          { name: 'Setup doctor', value: 'setup' },
          { name: 'All player panels', value: 'all' }
        )
    )
    .addStringOption((option) =>
      option
        .setName('title')
        .setDescription('Optional panel title.')
        .setMaxLength(100)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('description')
        .setDescription('Optional panel description.')
        .setMaxLength(1000)
        .setRequired(false)
    )
    .addStringOption((option) =>
      option
        .setName('image_url')
        .setDescription('Optional image URL to show under the panel.')
        .setMaxLength(1000)
        .setRequired(false)
    ),
  async execute(interaction) {
    if (!(await requireStaff(interaction))) {
      return;
    }

    if (!interaction.channel?.isSendable()) {
      await interaction.reply({
        content: 'I can only post a support panel in a channel where I can send messages. Please try again in a sendable channel.',
        flags: 'Ephemeral'
      });
      return;
    }

    const missingPermissions = missingSupportPanelPermissions(interaction);
    if (missingPermissions.length > 0) {
      await interaction.reply({
        content: supportPanelPermissionMessage(missingPermissions),
        flags: 'Ephemeral'
      });
      return;
    }

    const panelType = interaction.options.getString('panel_type') ?? 'support';
    const title = interaction.options.getString('title');
    const description = interaction.options.getString('description');
    const imageUrl = interaction.options.getString('image_url');

    try {
      for (const payload of panelPayloads(panelType, { title, description, imageUrl })) {
        await interaction.channel.send(payload);
      }
    } catch (error) {
      if (isMissingPermissionsError(error)) {
        await interaction.reply({
          content: supportPanelPermissionMessage(),
          flags: 'Ephemeral'
        });
        return;
      }

      throw error;
    }

    await interaction.reply({
      content: panelType === 'all' ? 'All set. Player panels posted.' : 'All set. Panel posted.',
      flags: 'Ephemeral'
    });

    await postStaffLog(interaction.client, {
      title: 'Support Panel Posted',
      description: panelType === 'all' ? 'All player panels were posted.' : `A ${panelType} panel was posted.`,
      fields: [
        { name: 'Panel', value: panelType, inline: true },
        { name: 'Channel', value: `<#${interaction.channelId}>`, inline: true },
        { name: 'Posted by', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true }
      ]
    });
  }
};

export async function handleSupportPanelComponent(interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<boolean> {
  const supportButtonPrefix = `${supportPanelCustomId}:`;
  const supportContinuePrefix = `${supportContinueCustomId}:`;
  const isSupportButton = interaction.isButton() && interaction.customId.startsWith(supportButtonPrefix);
  const isContinueButton = interaction.isButton() && interaction.customId.startsWith(supportContinuePrefix);
  const isPanelMenu = interaction.isStringSelectMenu()
    && [supportPanelCustomId, supportTriageCustomId, infoPanelCustomId, playtestPanelCustomId, staffPanelCustomId, setupPanelCustomId].includes(interaction.customId);

  if (!isSupportButton && !isContinueButton && !isPanelMenu) {
    return false;
  }

  const category = isContinueButton
    ? interaction.customId.slice(supportContinuePrefix.length)
    : interaction.isButton()
    ? interaction.customId.slice(supportButtonPrefix.length)
    : interaction.values[0];

  if (interaction.isStringSelectMenu()) {
    if (interaction.customId === supportTriageCustomId) {
      await handleSupportTriageSelection(interaction, category);
      return true;
    }

    if (interaction.customId === infoPanelCustomId) {
      await handleInfoPanelSelection(interaction, category);
      return true;
    }

    if (interaction.customId === playtestPanelCustomId) {
      await handlePlaytestPanelSelection(interaction, category);
      return true;
    }

    if (interaction.customId === staffPanelCustomId) {
      await handleStaffPanelSelection(interaction, category);
      return true;
    }

    if (interaction.customId === setupPanelCustomId) {
      if (!(await requireStaff(interaction))) {
        return true;
      }

      await interaction.reply({ embeds: [await setupDoctorEmbed(interaction)], flags: 'Ephemeral' });
      return true;
    }
  }

  if (category === 'bug') {
    if (!isContinueButton) {
      await showKnownIssuesGate(interaction, 'bug');
      return true;
    }

    await beginBugReportIntakeFromPanel(interaction);
    return true;
  }

  if (category === 'feedback') {
    await beginFeedbackReportFromPanel(interaction);
    return true;
  }

  if (category === 'performance') {
    await beginPerformanceReportIntakeFromPanel(interaction);
    return true;
  }

  if (category === 'suggestion') {
    await beginSuggestionFromPanel(interaction);
    return true;
  }

  if (category === 'crash') {
    if (!isContinueButton) {
      await showKnownIssuesGate(interaction, 'crash');
      return true;
    }

    await beginCrashReportIntakeFromPanel(interaction);
    return true;
  }

  if (category === 'playtest') {
    await interaction.reply({
      content: [
        'For a published playtest, accept the terms/privacy button in the playtest channel to get the ZIP and CurseForge import steps.',
        'When you begin testing, use `/playtest start` so bugs, crashes, feedback, and Spark links can be tied to your session.'
      ].join('\n'),
      flags: 'Ephemeral'
    });
    return true;
  }

  if (category === 'question') {
    await interaction.reply({
      content: qaQuestionHelpText(),
      flags: 'Ephemeral'
    });
    return true;
  }

  if (category === 'other') {
    await beginOtherHelpTicket(interaction);
    return true;
  }

  if (category === 'knownissues') {
    await interaction.reply({ embeds: [knownIssuesEmbed(listKnownIssues())], flags: 'Ephemeral' });
    return true;
  }

  if (category === 'notsure') {
    await interaction.reply({
      embeds: [
        baseEmbed('Help Me Pick', 'No problem. Choose the closest match and I will route you to the right flow.')
          .addFields(
            { name: 'Game closed or will not launch', value: 'Use crash report.' },
            { name: 'Something is broken in-game', value: 'Use bug report.' },
            { name: 'Lag, stutter, FPS, or freezes', value: 'Use performance report.' },
            { name: 'Idea or request', value: 'Use suggestion.' },
            { name: 'Opinion, balance, pacing, or playtest notes', value: 'Use feedback.' },
            { name: 'Private or account/install help', value: 'Use Other Help.' }
          )
      ],
      components: [supportTriageMenu()],
      flags: 'Ephemeral'
    });
    return true;
  }

  return false;
}

async function handleSupportTriageSelection(interaction: StringSelectMenuInteraction, category: string): Promise<void> {
  if (category === 'bug') {
    await showKnownIssuesGate(interaction, 'bug');
    return;
  }

  if (category === 'crash') {
    await showKnownIssuesGate(interaction, 'crash');
    return;
  }

  if (category === 'feedback') {
    await beginFeedbackReportFromPanel(interaction);
    return;
  }

  if (category === 'suggestion') {
    await beginSuggestionFromPanel(interaction);
    return;
  }

  if (category === 'performance') {
    await beginPerformanceReportIntakeFromPanel(interaction);
    return;
  }

  await beginOtherHelpTicket(interaction);
}

async function showKnownIssuesGate(interaction: ButtonInteraction | StringSelectMenuInteraction, category: 'bug' | 'crash'): Promise<void> {
  const label = category === 'bug' ? 'bug report' : 'crash report';
  const uploadGuidance = category === 'crash'
    ? 'Continue to open a private crash intake channel. I will ask for the log upload there, redact it, and create the Crash forum post after you confirm.'
    : 'Continue to open a private bug intake channel. I will ask one question at a time, including optional screenshots/logs, then post the final report after you confirm.';
  await interaction.reply({
    embeds: [
      baseEmbed('Quick Duplicate Check', `Before starting the ${label}, you can check known issues or continue now.`)
        .addFields(
          {
            name: 'Why this exists',
            value: 'If staff already knows about it, you can skip filing another report. If you are not sure, continue anyway.'
          },
          {
            name: 'Guided intake',
            value: uploadGuidance
          }
        )
    ],
    components: [knownIssuesGateButtons(category)],
    flags: 'Ephemeral'
  });
}

async function handleInfoPanelSelection(interaction: StringSelectMenuInteraction, category: string): Promise<void> {
  if (category === 'status') {
    await interaction.reply({ embeds: [statusPanelEmbed()], flags: 'Ephemeral' });
    return;
  }

  if (category === 'knownissues') {
    await interaction.reply({ embeds: [knownIssuesEmbed(listKnownIssues())], flags: 'Ephemeral' });
    return;
  }

  if (category === 'changelog') {
    await interaction.reply({ embeds: [changelogEmbed(listChangelogEntries())], flags: 'Ephemeral' });
    return;
  }

  if (category === 'privacy') {
    await interaction.reply({ embeds: [privacyEmbed()], flags: 'Ephemeral' });
    return;
  }

  await interaction.reply({
    embeds: [
      baseEmbed('Command Map', 'Use these panels first. Slash commands still exist for power users and attachment-heavy reports.')
        .addFields(
          { name: 'Reports', value: '`/bugreport`, `/crash`, `/feedback`, `/perfreport`, `/sparkreport`' },
          { name: 'Info', value: '`/status`, `/knownissues`, `/changelog`, `/privacy`, `/help`' },
          { name: 'Playtesting', value: '`/playtest start`, `/playtest end`, `/playtest checklist`' }
        )
    ],
    flags: 'Ephemeral'
  });
}

async function handlePlaytestPanelSelection(interaction: StringSelectMenuInteraction, category: string): Promise<void> {
  if (category === 'start') {
    await beginPlaytestSessionFromPanel(interaction);
    return;
  }

  if (category === 'checklist') {
    await interaction.reply({ embeds: [playtestChecklistEmbed()], flags: 'Ephemeral' });
    return;
  }

  if (category === 'spark') {
    await interaction.reply({
      embeds: [
        baseEmbed('Spark Playtesting', 'Use Spark when testing lag, TPS, freezes, or worldgen performance.')
          .addFields(
            { name: 'Start', value: 'Create a tester session first, then run Spark during the lag period.' },
            { name: 'Commands', value: 'Servers usually use `/spark profiler start --timeout 120`. Client installs may use `/sparkc`.' },
            { name: 'Archive', value: 'Submit the public Spark viewer link with `/sparkreport` so staff can tie it to your playtest session.' }
          )
      ],
      flags: 'Ephemeral'
    });
    return;
  }

  if (category === 'zip') {
    await interaction.reply({
      content: [
        'For published playtests, click the terms/privacy acceptance button in the playtest channel.',
        'After acceptance, I will privately send the ZIP link and CurseForge import steps.',
        'Download the ZIP, do not unzip it, then import it into CurseForge as an existing ZIP/profile.'
      ].join('\n'),
      flags: 'Ephemeral'
    });
    return;
  }

  if (category === 'verify') {
    await interaction.reply({
      content: [
        'Use `/minecraft link` in Discord to get a one-time code.',
        config.minecraftVerification.relayChannelId
          ? 'Then join the playtest server and run `/wo link CODE` there.'
          : 'Then run `/wo link CODE` in the playtest client.',
        'This links your Discord account to your Minecraft player for playtest reports.'
      ].join('\n'),
      flags: 'Ephemeral'
    });
    return;
  }

  if (category === 'feedback') {
    await beginFeedbackReportFromPanel(interaction);
    return;
  }

  if (category === 'performance') {
    await beginPerformanceReportIntakeFromPanel(interaction);
    return;
  }

  if (category === 'bug') {
    await beginBugReportIntakeFromPanel(interaction);
    return;
  }

  await beginCrashReportIntakeFromPanel(interaction);
}

async function handleStaffPanelSelection(interaction: StringSelectMenuInteraction, category: string): Promise<void> {
  if (!(await requireStaff(interaction))) {
    return;
  }

  if (category === 'setup') {
    await interaction.reply({ embeds: [await setupDoctorEmbed(interaction)], flags: 'Ephemeral' });
    return;
  }

  const embed = baseEmbed('Staff Console', staffPanelDescription(category)).setColor(0x6d5b98);

  if (category === 'reports') {
    embed.addFields(
      { name: 'View one report', value: '`/staff report view id:WO-BUG-0001`' },
      { name: 'Search reports', value: '`/staff report search keyword:rifts`' },
      { name: 'Q&A handoffs', value: '`WO-QA-0001` records are included in report search and view.' }
    );
  } else if (category === 'statuses') {
    embed.addFields(
      { name: 'Bug status', value: '`/staff bug status id:WO-BUG-0001 status:confirmed` or `status:solved`' },
      { name: 'Crash status', value: '`/staff crash status id:WO-CRASH-0001 status:fixed`' },
      { name: 'Spark status', value: '`/staff spark status id:WO-SPARK-0001 status:needs_review`' }
    );
  } else if (category === 'issues') {
    embed.addFields(
      { name: 'Known issues', value: '`/staff issue add`, `/staff issue update`, `/staff issue remove`' },
      { name: 'Player view', value: 'Players see the list from the info panel or `/knownissues`.' }
    );
  } else if (category === 'changelog') {
    embed.addFields(
      { name: 'Add changelog', value: '`/staff changelog add`' },
      { name: 'Player view', value: 'Players see recent entries from the info panel or `/changelog`.' }
    );
  } else if (category === 'playtest') {
    embed.addFields(
      { name: 'Publish gated ZIP', value: '`/playtest publish` creates the channel, acceptance gate, and private ZIP delivery.' },
      { name: 'Review sessions', value: '`/playtest list` and `/playtest view session_id:WO-TEST-0001`' }
    );
  } else {
    embed.addFields(
      { name: 'Q&A setup', value: '`QA_CHANNEL_IDS`, `QA_TEAM_CHANNEL_ID`, and optional `QA_TEAM_ROLE_ID` in `.env`.' },
      { name: 'Behavior', value: 'Known questions get canned answers. Unknown questions become `WO-QA-0001` handoffs.' },
      { name: 'Knowledge base', value: '`qa-responses/**/*.txt` files manage default topic embeds with `phrases:` and `response:` sections. `/staff qa add`, `/staff qa edit`, `/staff qa list`, and `/staff qa remove` manage extra overrides.' }
    );
  }

  await interaction.reply({ embeds: [embed], flags: 'Ephemeral' });
}

function panelPayloads(panelType: string, input: {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
}) {
  if (panelType === 'all') {
    return [
      supportPanelPayload(input),
      infoPanelPayload(),
      playtestPanelPayload()
    ];
  }

  if (panelType === 'info') {
    return [infoPanelPayload()];
  }

  if (panelType === 'playtest') {
    return [playtestPanelPayload()];
  }

  if (panelType === 'staff') {
    return [staffPanelPayload()];
  }

  if (panelType === 'setup') {
    return [setupPanelPayload()];
  }

  return [supportPanelPayload(input)];
}

function missingSupportPanelPermissions(interaction: ChatInputCommandInteraction): string[] {
  const sendPermission = interaction.channel?.isThread()
    ? { flag: PermissionsBitField.Flags.SendMessagesInThreads, label: 'Send Messages in Threads' }
    : { flag: PermissionsBitField.Flags.SendMessages, label: 'Send Messages' };
  const requiredPermissions = [
    { flag: PermissionsBitField.Flags.ViewChannel, label: 'View Channel' },
    sendPermission,
    { flag: PermissionsBitField.Flags.EmbedLinks, label: 'Embed Links' }
  ];

  return requiredPermissions
    .filter(({ flag }) => !interaction.appPermissions.has(flag))
    .map(({ label }) => label);
}

function supportPanelPermissionMessage(missingPermissions: string[] = []): string {
  const missingText = missingPermissions.length > 0
    ? ` Missing: ${missingPermissions.join(', ')}.`
    : '';

  return [
    'I cannot post the support panel in this channel yet because Discord denied the send request.',
    `Please give me View Channel, Send Messages, and Embed Links here, then run \`/supportpanel\` again.${missingText}`
  ].join(' ');
}

function isMissingPermissionsError(error: unknown): boolean {
  if (typeof error !== 'object' || error === null) {
    return false;
  }

  return (error as { code?: unknown }).code === RESTJSONErrorCodes.MissingPermissions;
}

function supportPanelPayload(input: {
  title: string | null;
  description: string | null;
  imageUrl: string | null;
}) {
  const embed = baseEmbed(
    input.title ?? 'Wilderness Oddesy Support Hub',
    input.description ?? supportPanelDescription()
  );

  if (!input.description) {
    embed.addFields(
      ...supportActionPresets.map((preset) => ({
        name: preset.fieldTitle,
        value: preset.fieldDescription,
        inline: false
      }))
    );
  }

  if (input.imageUrl) {
    embed.setImage(input.imageUrl);
  }

  return {
    embeds: [embed],
    components: [supportActionMenu(supportPanelCustomId, 'Select a support option')]
  };
}

function knownIssuesGateButtons(category: 'bug' | 'crash'): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    supportButton('knownissues', 'View Known Issues', ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`${supportContinueCustomId}:${category}`)
      .setLabel(category === 'bug' ? 'Continue Bug Report' : 'Continue Crash Report')
      .setStyle(ButtonStyle.Primary)
  );
}

function supportTriageMenu(): ActionRowBuilder<StringSelectMenuBuilder> {
  return supportActionMenu(
    supportTriageCustomId,
    'Pick what sounds closest',
    ['crash', 'bug', 'suggestion', 'feedback', 'performance', 'other']
  );
}

function supportButton(category: string, label: string, style: ButtonStyle): ButtonBuilder {
  return new ButtonBuilder()
    .setCustomId(`${supportPanelCustomId}:${category}`)
    .setLabel(label)
    .setStyle(style);
}

function supportPanelDescription(): string {
  return [
    'Pick the support route that fits best. If you are unsure, choose Help me pick.',
    'Reports go to staff triage. Other Help opens a private ticket.'
  ].join('\n');
}

function qaQuestionHelpText(): string {
  if (config.qa.forumChannelId) {
    return [
      `Open a post in <#${config.qa.forumChannelId}> for community Q&A.`,
      'I will answer first if I recognize the topic. If I cannot answer confidently, or you say you still need help, I will hand it to support and include devs for crash or bug-looking issues.'
    ].join('\n');
  }

  if (config.qa.channelIds.length > 0) {
    return [
      `Ask your question in ${config.qa.channelIds.map((channelId) => `<#${channelId}>`).join(', ')}.`,
      'If I recognize the issue, I will answer with the matching support steps. If I do not, or you say you still need help, I will alert support.'
    ].join('\n');
  }

  return 'The community Q&A forum is not configured yet. Please use the other support options here for now.';
}

function supportActionMenu(
  customId: string,
  placeholder: string,
  categories: SupportActionCategory[] = supportActionPresets.map((preset) => preset.value)
): ActionRowBuilder<StringSelectMenuBuilder> {
  const options = categories
    .map((category) => supportActionPresets.find((preset) => preset.value === category))
    .filter((preset): preset is SupportActionPreset => Boolean(preset))
    .map((preset) => ({
      label: preset.label,
      value: preset.value,
      description: preset.optionDescription
    }));

  return new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(customId)
      .setPlaceholder(placeholder)
      .addOptions(options)
  );
}

function infoPanelPayload() {
  const embed = baseEmbed(
    'Wilderness Oddesy Info Center',
    'Use this panel for common player information without remembering status commands.'
  )
    .addFields(
      { name: 'Status', value: 'Current pack version, Java/RAM recommendations, support channels, and unstable features.', inline: true },
      { name: 'Known issues', value: 'Staff-maintained issue list for current builds.', inline: true },
      { name: 'Changelog', value: 'Recent staff-posted release notes.', inline: true },
      { name: 'Privacy', value: 'What the bot collects, avoids, and forwards.', inline: true }
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(infoPanelCustomId)
    .setPlaceholder('Select info to view')
    .addOptions(
      { label: 'Support status', value: 'status', description: 'Version, Java, RAM, support, and server status.' },
      { label: 'Known issues', value: 'knownissues', description: 'Current staff-tracked issues.' },
      { label: 'Changelog', value: 'changelog', description: 'Recent release notes.' },
      { label: 'Privacy', value: 'privacy', description: 'What the bot collects and avoids.' },
      { label: 'Command map', value: 'commands', description: 'Quick command reference for power users.' }
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)]
  };
}

function playtestPanelPayload() {
  const embed = baseEmbed(
    'Wilderness Oddesy Playtest Center',
    'Use this panel during test builds so sessions, reports, and Spark links stay organized.'
  )
    .addFields(
      { name: 'Start session', value: 'Create a tester session before you begin. Requires Minecraft verification.', inline: true },
      { name: 'Checklist', value: 'Use a repeatable stability route.', inline: true },
      { name: 'Spark help', value: 'Profile lag and submit viewer links.', inline: true },
      { name: 'Report while testing', value: 'Send bugs, feedback, performance notes, and crash logs.', inline: false }
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(playtestPanelCustomId)
    .setPlaceholder('Select a playtest action')
    .addOptions(
      { label: 'Start tester session', value: 'start', description: 'Open a session form for WO-TEST tracking.' },
      { label: 'Verify Minecraft account', value: 'verify', description: 'Link Discord to Minecraft with a one-time code.' },
      { label: 'Playtest checklist', value: 'checklist', description: 'Show the stability route.' },
      { label: 'Playtest ZIP help', value: 'zip', description: 'CurseForge import and acceptance guidance.' },
      { label: 'Spark profiling help', value: 'spark', description: 'How to profile and submit Spark links.' },
      { label: 'Report gameplay bug', value: 'bug', description: 'Open private bug intake.' },
      { label: 'Send feedback', value: 'feedback', description: 'Open a playtest feedback modal.' },
      { label: 'Report performance', value: 'performance', description: 'Open private performance intake.' },
      { label: 'Game crashed or will not launch', value: 'crash', description: 'Open private crash intake.' }
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)]
  };
}

function staffPanelPayload() {
  const embed = baseEmbed(
    'Wilderness Oddesy Staff Console',
    'Staff-only quick reference for triage, playtest publishing, known issues, and Q&A handoffs.'
  )
    .setColor(0x6d5b98)
    .addFields(
      { name: 'Reports', value: 'Search and open support records.', inline: true },
      { name: 'Statuses', value: 'Move reports through triage.', inline: true },
      { name: 'Playtests', value: 'Publish gated builds and review tester sessions.', inline: true },
      { name: 'Q&A', value: 'Understand forwarded unknown questions.', inline: true }
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(staffPanelCustomId)
    .setPlaceholder('Select a staff workflow')
    .addOptions(
      { label: 'Report lookup/search', value: 'reports', description: 'View reports or search by keyword.' },
      { label: 'Update statuses', value: 'statuses', description: 'Bug, crash, and Spark triage commands.' },
      { label: 'Known issues', value: 'issues', description: 'Add, update, or remove known issues.' },
      { label: 'Changelog', value: 'changelog', description: 'Add release notes.' },
      { label: 'Playtest publishing', value: 'playtest', description: 'Publish ZIPs and review sessions.' },
      { label: 'Run setup doctor', value: 'setup', description: 'Check config, channels, and permissions.' },
      { label: 'Q&A handoffs', value: 'qa', description: 'Configured Q&A channels and forwarded questions.' }
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)]
  };
}

function setupPanelPayload() {
  const embed = baseEmbed(
    'Wilderness Oddesy Setup Doctor',
    'Run these checks after changing config, channels, permissions, or hosting environments.'
  )
    .setColor(0x6d5b98)
    .addFields(
      { name: 'Full health check', value: 'Checks important config values, report channels, Q&A routing, and current channel permissions.' },
      { name: 'When to use it', value: 'After moving hosts, changing `.env`, creating new channels, enabling Q&A, or publishing playtest channels.' }
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId(setupPanelCustomId)
    .setPlaceholder('Run a setup check')
    .addOptions(
      { label: 'Run full setup doctor', value: 'full', description: 'Config, channels, and permissions.' },
      { label: 'Check channels', value: 'channels', description: 'Verify configured channel IDs can be reached.' },
      { label: 'Check permissions', value: 'permissions', description: 'Verify current channel permissions.' },
      { label: 'Check Q&A setup', value: 'qa', description: 'Verify Q&A channel routing.' },
      { label: 'Check playtest setup', value: 'playtest', description: 'Verify playtest channel/category settings.' }
    );

  return {
    embeds: [embed],
    components: [new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu)]
  };
}

function statusPanelEmbed() {
  const supportChannel = config.channelIds.support ? `<#${config.channelIds.support}>` : config.status.supportChannels.join(', ');
  return baseEmbed('Support Status', 'Wilderness Oddesy systems online.')
    .addFields(
      { name: 'Latest modpack version', value: config.status.latestModpackVersion, inline: true },
      { name: 'Recommended Java', value: config.status.recommendedJavaVersion, inline: true },
      { name: 'Recommended RAM', value: config.status.recommendedRam, inline: true },
      { name: 'Support channels', value: supportChannel },
      { name: 'Known unstable features', value: config.status.knownUnstableFeatures.join(', ') || 'None configured' },
      { name: 'Server status', value: config.status.serverStatusLabel }
    );
}

function playtestChecklistEmbed() {
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
    'Report bugs, crashes, feedback, or Spark profiles with this panel or the matching commands.'
  ];

  return baseEmbed('Playtesting Checklist', 'Singleplayer stability route for testers.')
    .addFields({ name: 'Checklist', value: checklist.map((item) => `- ${item}`).join('\n') });
}

function staffPanelDescription(category: string): string {
  const descriptions: Record<string, string> = {
    reports: 'Find support records without digging through channels.',
    statuses: 'Move reports through staff triage states.',
    issues: 'Manage the player-facing known issues list.',
    changelog: 'Post release notes players can view from the info panel.',
    playtest: 'Publish gated playtest ZIPs and review tester sessions.',
    setup: 'Check config, channel routing, and Discord permissions.',
    qa: 'Configure and review Q&A handoffs.'
  };

  return descriptions[category] ?? 'Staff workflow reference.';
}
