import {
  EmbedBuilder,
  PermissionsBitField,
  StringSelectMenuInteraction
} from 'discord.js';
import { config } from '../config';
import { colors, truncate } from '../utils/embeds';

type CheckState = 'OK' | 'WARN' | 'MISSING';

interface CheckLine {
  state: CheckState;
  label: string;
  detail: string;
}

export async function setupDoctorEmbed(interaction: StringSelectMenuInteraction): Promise<EmbedBuilder> {
  const checks: CheckLine[] = [];

  checks.push(...requiredConfigChecks());
  checks.push(...permissionChecks(interaction));
  checks.push(...await channelChecks(interaction));

  const missing = checks.filter((check) => check.state === 'MISSING').length;
  const warnings = checks.filter((check) => check.state === 'WARN').length;
  const color = missing > 0 ? colors.danger : warnings > 0 ? colors.warning : colors.primary;

  return new EmbedBuilder()
    .setTitle('Setup Doctor')
    .setColor(color)
    .setDescription(`Health check complete. Missing: ${missing}. Warnings: ${warnings}.`)
    .addFields(
      { name: 'Config', value: formatChecks(checks.filter((check) => configLabels.has(check.label))) },
      { name: 'Permissions', value: formatChecks(checks.filter((check) => permissionLabels.has(check.label))) },
      { name: 'Channels', value: formatChecks(checks.filter((check) => channelLabels.has(check.label))) }
    )
    .setTimestamp();
}

function requiredConfigChecks(): CheckLine[] {
  return [
    checkValue('Discord token', config.discordToken ? 'configured' : null, 'Required for login.'),
    checkValue('Client ID', config.clientId ? 'configured' : null, 'Required for slash command deployment.'),
    checkValue('Guild ID', config.guildId, 'Recommended for fast guild command deployment.'),
    checkValue('Support team role', config.support.teamRoleId, 'Recommended for report pings and Other Help ticket access.'),
    checkValue('Q&A team channel', config.qa.teamChannelId, 'Required only if Q&A forwarding is enabled.'),
    {
      state: config.qa.channelIds.length > 0 ? 'OK' : 'WARN',
      label: 'Q&A watch channels',
      detail: config.qa.channelIds.length > 0 ? `${config.qa.channelIds.length} configured.` : 'No Q&A watch channels configured.'
    },
    {
      state: 'OK',
      label: 'In-bot playtest policies',
      detail: 'Terms and privacy are available from playtest gate buttons.'
    },
    {
      state: 'OK',
      label: 'External terms URL',
      detail: config.playtest.termsUrl ? 'Configured.' : 'Optional external copy not configured.'
    },
    {
      state: 'OK',
      label: 'External privacy URL',
      detail: config.playtest.privacyUrl ? 'Configured.' : 'Optional external copy not configured.'
    },
    {
      state: config.minecraftVerification.apiEnabled ? 'OK' : 'WARN',
      label: 'Minecraft verify API',
      detail: config.minecraftVerification.apiEnabled
        ? `Enabled on ${config.minecraftVerification.apiHost}:${config.minecraftVerification.apiPort}.`
        : 'Disabled; in-game /wo link cannot complete codes.'
    },
    checkValue('Minecraft verify URL', config.minecraftVerification.publicBaseUrl, 'Recommended so Discord can show the base URL for the mod client config.')
  ];
}

function permissionChecks(interaction: StringSelectMenuInteraction): CheckLine[] {
  const member = interaction.guild?.members.me;
  const channelPermissions = member && interaction.channel && 'permissionsFor' in interaction.channel
    ? interaction.channel.permissionsFor(member)
    : null;

  const required = [
    [PermissionsBitField.Flags.ViewChannel, 'View channel', 'Needed to see configured channels.'],
    [PermissionsBitField.Flags.SendMessages, 'Send messages', 'Needed for panels and report posts.'],
    [PermissionsBitField.Flags.CreatePublicThreads, 'Create public threads', 'Needed for report posts in Discord forum channels.'],
    [PermissionsBitField.Flags.EmbedLinks, 'Embed links', 'Needed for clean support cards.'],
    [PermissionsBitField.Flags.ReadMessageHistory, 'Read history', 'Useful for Q&A and context.']
  ] as const;

  const optional = [
    [PermissionsBitField.Flags.ManageChannels, 'Manage channels', 'Needed for /playtest publish and Other Help ticket creation.'],
    [PermissionsBitField.Flags.AttachFiles, 'Attach files', 'Useful for future generated exports or logs.']
  ] as const;

  const checks: CheckLine[] = [];
  for (const [flag, label, detail] of required) {
    checks.push({
      state: channelPermissions?.has(flag) ? 'OK' : 'MISSING',
      label,
      detail
    });
  }

  for (const [flag, label, detail] of optional) {
    checks.push({
      state: channelPermissions?.has(flag) ? 'OK' : 'WARN',
      label,
      detail
    });
  }

  return checks;
}

async function channelChecks(interaction: StringSelectMenuInteraction): Promise<CheckLine[]> {
  const channelMap: Array<[string, string | undefined, boolean]> = [
    ['Issues forum', config.forumChannels.issues, false],
    ['Feedback/suggestions forum', config.forumChannels.ideas, false],
    ...(!config.forumChannels.issues
      ? [
        ['Bug reports', config.channelIds.bugReports, true] as [string, string | undefined, boolean],
        ['Crash reports', config.channelIds.crashReports, true] as [string, string | undefined, boolean],
        ['Performance reports', config.channelIds.performanceReports, true] as [string, string | undefined, boolean]
      ]
      : []),
    ...(!config.forumChannels.ideas
      ? [
        ['Feedback', config.channelIds.feedbackReports, true] as [string, string | undefined, boolean],
        ['Suggestions', config.channelIds.suggestions, true] as [string, string | undefined, boolean]
      ]
      : []),
    ['Spark reports', config.channelIds.sparkReports, true],
    ['Playtest sessions', config.channelIds.playtestSessions, true],
    ['Support', config.channelIds.support, false],
    ['Q&A team', config.qa.teamChannelId, config.qa.channelIds.length > 0],
    ['Support ticket category', config.channelIds.supportTicketCategory, false],
    ['Playtest category', config.channelIds.playtestCategory, false]
  ];

  const checks: CheckLine[] = [];
  for (const [label, channelId, required] of channelMap) {
    if (!channelId) {
      checks.push({
        state: required ? 'MISSING' : 'WARN',
        label,
        detail: required ? 'Not configured.' : 'Optional channel not configured.'
      });
      continue;
    }

    const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
    if (!channel) {
      checks.push({ state: 'MISSING', label, detail: `Configured ID ${channelId} was not found.` });
      continue;
    }

    const sendable = 'isSendable' in channel && channel.isSendable();
    const threadOnly = 'isThreadOnly' in channel && channel.isThreadOnly();
    checks.push({
      state: sendable || threadOnly || label.endsWith('category') ? 'OK' : 'WARN',
      label,
      detail: sendable || threadOnly || label.endsWith('category') ? `Configured: <#${channelId}>.` : `Found <#${channelId}>, but it may not be sendable.`
    });
  }

  return checks;
}

function checkValue(label: string, value: string | null | undefined, missingDetail: string): CheckLine {
  return {
    state: value ? 'OK' : 'WARN',
    label,
    detail: value ? 'Configured.' : missingDetail
  };
}

function formatChecks(checks: CheckLine[]): string {
  if (checks.length === 0) {
    return 'No checks in this group.';
  }

  return truncate(checks.map((check) => `${check.state}: ${check.label} - ${check.detail}`).join('\n'), 1024);
}

const configLabels = new Set([
  'Discord token',
  'Client ID',
  'Guild ID',
  'Support team role',
  'Q&A team channel',
  'Q&A watch channels',
  'In-bot playtest policies',
  'External terms URL',
  'External privacy URL',
  'Minecraft verify API',
  'Minecraft verify URL'
]);

const permissionLabels = new Set([
  'View channel',
  'Send messages',
  'Create public threads',
  'Embed links',
  'Read history',
  'Manage channels',
  'Attach files'
]);

const channelLabels = new Set([
  'Issues forum',
  'Feedback/suggestions forum',
  'Bug reports',
  'Crash reports',
  'Feedback',
  'Performance reports',
  'Suggestions',
  'Spark reports',
  'Playtest sessions',
  'Support',
  'Q&A team',
  'Support ticket category',
  'Playtest category'
]);
