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
    checkValue('Q&A team channel', config.qa.teamChannelId, 'Required only if Q&A forwarding is enabled.'),
    {
      state: config.qa.channelIds.length > 0 ? 'OK' : 'WARN',
      label: 'Q&A watch channels',
      detail: config.qa.channelIds.length > 0 ? `${config.qa.channelIds.length} configured.` : 'No Q&A watch channels configured.'
    },
    checkValue('Playtest terms URL', config.playtest.termsUrl, 'Recommended for gated playtest ZIPs.'),
    checkValue('Playtest privacy URL', config.playtest.privacyUrl, 'Recommended for gated playtest ZIPs.'),
    {
      state: config.minecraftVerification.apiEnabled ? 'OK' : 'WARN',
      label: 'Minecraft verify API',
      detail: config.minecraftVerification.apiEnabled
        ? `Enabled on ${config.minecraftVerification.apiHost}:${config.minecraftVerification.apiPort}.`
        : 'Disabled; in-game /wo link cannot complete codes.'
    },
    checkValue('Minecraft verify URL', config.minecraftVerification.publicBaseUrl, 'Recommended so Discord can show the endpoint the mod should call.')
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
    [PermissionsBitField.Flags.EmbedLinks, 'Embed links', 'Needed for clean support cards.'],
    [PermissionsBitField.Flags.ReadMessageHistory, 'Read history', 'Useful for Q&A and context.']
  ] as const;

  const optional = [
    [PermissionsBitField.Flags.ManageChannels, 'Manage channels', 'Needed for /playtest publish channel creation.'],
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
    ['Bug reports', config.channelIds.bugReports, true],
    ['Crash reports', config.channelIds.crashReports, true],
    ['Feedback', config.channelIds.feedbackReports, true],
    ['Performance reports', config.channelIds.performanceReports, true],
    ['Suggestions', config.channelIds.suggestions, false],
    ['Spark reports', config.channelIds.sparkReports, true],
    ['Playtest sessions', config.channelIds.playtestSessions, true],
    ['Support', config.channelIds.support, false],
    ['Q&A team', config.qa.teamChannelId, config.qa.channelIds.length > 0],
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
    checks.push({
      state: sendable || label === 'Playtest category' ? 'OK' : 'WARN',
      label,
      detail: sendable || label === 'Playtest category' ? `Configured: <#${channelId}>.` : `Found <#${channelId}>, but it may not be sendable.`
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
  'Q&A team channel',
  'Q&A watch channels',
  'Playtest terms URL',
  'Playtest privacy URL',
  'Minecraft verify API',
  'Minecraft verify URL'
]);

const permissionLabels = new Set([
  'View channel',
  'Send messages',
  'Embed links',
  'Read history',
  'Manage channels',
  'Attach files'
]);

const channelLabels = new Set([
  'Bug reports',
  'Crash reports',
  'Feedback',
  'Performance reports',
  'Suggestions',
  'Spark reports',
  'Playtest sessions',
  'Support',
  'Q&A team',
  'Playtest category'
]);
