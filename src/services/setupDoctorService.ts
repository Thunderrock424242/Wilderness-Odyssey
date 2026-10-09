import { ChannelType, PermissionsBitField } from 'discord.js';
import type { ChatInputCommandInteraction, StringSelectMenuInteraction } from 'discord.js';
import { config } from '../config';
import { baseEmbed, colors } from '../utils/embeds';

export type SetupSection = 'full' | 'channels' | 'permissions' | 'qa' | 'playtest';
type SetupInteraction = ChatInputCommandInteraction | StringSelectMenuInteraction;
type CheckState = 'OK' | 'WARN' | 'MISSING' | 'OFF';
type CheckGroup = 'Configuration' | 'Permissions' | 'Channels' | 'Q&A' | 'Playtests';

interface CheckLine {
  state: CheckState;
  group: CheckGroup;
  label: string;
  detail: string;
}

interface ChannelCheck {
  label: string;
  variable: string;
  id?: string;
  kind: 'forum' | 'category' | 'text';
  group: CheckGroup;
  required?: boolean;
  readOnly?: boolean;
  files?: boolean;
  tags?: string[];
}

export async function runSetupDoctor(interaction: SetupInteraction, section: SetupSection = 'full'): Promise<void> {
  await interaction.deferReply({ flags: 'Ephemeral' });
  const embeds = await setupDoctorEmbeds(interaction, section);
  await interaction.editReply({ embeds: [embeds[0]], allowedMentions: { parse: [] } });
  for (const embed of embeds.slice(1)) {
    await interaction.followUp({ embeds: [embed], flags: 'Ephemeral', allowedMentions: { parse: [] } });
  }
}

export function isSetupSection(value: string): value is SetupSection {
  return ['full', 'channels', 'permissions', 'qa', 'playtest'].includes(value);
}

export async function setupDoctorEmbeds(interaction: SetupInteraction, section: SetupSection = 'full') {
  const checks: CheckLine[] = [];
  if (section === 'full') {
    checks.push(
      configCheck('Server', 'GUILD_ID', config.guildId, 'Use the server ID for fast command registration.'),
      configCheck('Support role', 'SUPPORT_TEAM_ROLE_ID', config.support.teamRoleId, 'Set a support role so staff can access private tickets.'),
      configCheck('Dev role', 'DEV_TEAM_ROLE_ID', config.dev.teamRoleId, 'Optional role for bug and crash alerts.'),
      { state: 'WARN', group: 'Configuration', label: 'Player message access',
        detail: 'Confirm Message Content Intent is enabled in the Developer Portal for guided reports, Q&A, and the verification relay.' },
    );
  }
  if (section === 'full' || section === 'permissions') {
    checks.push(...permissionChecks(interaction));
  }
  if (section === 'full' || section === 'qa') {
    const enabled = Boolean(config.qa.forumChannelId || config.qa.channelIds.length);
    checks.push({ state: enabled ? 'OK' : 'OFF', group: 'Q&A', label: 'Automatic answers',
      detail: enabled ? 'Configured; enable Message Content Intent in the Developer Portal.' : 'Optional. Set QA_FORUM_CHANNEL_ID to enable.' });
  }
  if (section === 'full' || section === 'playtest') {
    const relay = Boolean(config.minecraftVerification.relayChannelId);
    const api = config.minecraftVerification.apiEnabled;
    checks.push({ state: relay || api ? 'OK' : 'OFF', group: 'Playtests', label: 'Minecraft linking',
      detail: relay ? 'Server relay configured.' : api ? 'Trusted server API configured.' : 'Optional. Needed for verified playtest sessions.' });
    if (relay) {
      checks.push({ state: config.minecraftVerification.relayWebhookId && config.guildId ? 'OK' : 'MISSING',
        group: 'Playtests', label: 'Relay trust', detail: 'Relay requires MINECRAFT_VERIFY_RELAY_WEBHOOK_ID and GUILD_ID.' });
    }
    if (api) {
      checks.push({ state: (process.env.MAIN_SERVER_INGEST_TOKEN?.trim().length ?? 0) >= 32 ? 'OK' : 'MISSING',
        group: 'Playtests', label: 'Server API authentication', detail: 'Requires MAIN_SERVER_INGEST_TOKEN with at least 32 characters on the trusted server. Never share it with players.' });
    }
    checks.push({ state: 'OK', group: 'Playtests', label: 'Terms and privacy', detail: 'Available from the playtest acceptance buttons.' });
  }
  if (section !== 'permissions') {
    const definitions = channelDefinitions().filter(item => section === 'full' || section === 'channels'
      || (section === 'qa' && item.group === 'Q&A') || (section === 'playtest' && item.group === 'Playtests'));
    // Bound concurrent REST work when several legacy Q&A channels are configured.
    for (let offset = 0; offset < definitions.length; offset += 4) {
      checks.push(...await Promise.all(definitions.slice(offset, offset + 4).map(item => channelCheck(interaction, item))));
    }
  }
  return renderChecks(checks, section);
}

function configCheck(label: string, variable: string, value: string | undefined, detail: string): CheckLine {
  return { state: value ? 'OK' : 'WARN', group: 'Configuration', label,
    detail: value ? `${variable} configured.` : `${variable}: ${detail}` };
}

function permissionChecks(interaction: SetupInteraction): CheckLine[] {
  const permissions = interaction.appPermissions;
  const inThread = interaction.channel?.isThread();
  const flags = [
    [PermissionsBitField.Flags.ViewChannel, 'View Channel'],
    [inThread ? PermissionsBitField.Flags.SendMessagesInThreads : PermissionsBitField.Flags.SendMessages,
      inThread ? 'Send Messages in Threads' : 'Send Messages'],
    [PermissionsBitField.Flags.EmbedLinks, 'Embed Links'],
    [PermissionsBitField.Flags.ReadMessageHistory, 'Read Message History'],
    [PermissionsBitField.Flags.AttachFiles, 'Attach Files'],
    [PermissionsBitField.Flags.ManageChannels, 'Manage Channels'],
  ] as const;
  return flags.map(([flag, label]) => ({
    state: permissions?.has(flag) ? 'OK' : 'MISSING', group: 'Permissions', label,
    detail: permissions?.has(flag) ? 'Allowed here.' : `Allow ${label} for the bot here.`,
  }));
}

function channelDefinitions(): ChannelCheck[] {
  const channels: ChannelCheck[] = [
    { label: 'Staff log', variable: 'STAFF_LOG_CHANNEL_ID', id: config.channelIds.staffLog, kind: 'text', group: 'Channels', required: true, files: true },
    { label: 'Support hub', variable: 'SUPPORT_CHANNEL_ID', id: config.channelIds.support, kind: 'text', group: 'Channels' },
    { label: 'Private ticket category', variable: 'SUPPORT_TICKET_CATEGORY_ID', id: config.channelIds.supportTicketCategory, kind: 'category', group: 'Channels' },
  ];
  if (config.forumChannels.issues) {
    channels.push({ label: 'Issues forum', variable: 'ISSUES_FORUM_CHANNEL_ID', id: config.forumChannels.issues, kind: 'forum', group: 'Channels',
      files: true,
      tags: [...config.forumTags.bug, ...config.forumTags.crash, ...config.forumTags.performance, ...config.forumTags.bugConfirmed, ...config.forumTags.bugSolved] });
  } else {
    channels.push(
      { label: 'Bug reports', variable: 'BUG_REPORTS_CHANNEL_ID', id: config.channelIds.bugReports, kind: 'text', group: 'Channels', required: true },
      { label: 'Crash reports', variable: 'CRASH_REPORTS_CHANNEL_ID', id: config.channelIds.crashReports, kind: 'text', group: 'Channels', required: true, files: true },
      { label: 'Performance reports', variable: 'PERFORMANCE_REPORTS_CHANNEL_ID', id: config.channelIds.performanceReports, kind: 'text', group: 'Channels', required: true },
    );
  }
  if (config.forumChannels.ideas) {
    channels.push({ label: 'Ideas forum', variable: 'IDEAS_FORUM_CHANNEL_ID', id: config.forumChannels.ideas, kind: 'forum', group: 'Channels',
      tags: [...config.forumTags.feedback, ...config.forumTags.suggestion] });
  } else {
    channels.push(
      { label: 'Feedback', variable: 'FEEDBACK_CHANNEL_ID', id: config.channelIds.feedbackReports, kind: 'text', group: 'Channels', required: true },
      { label: 'Suggestions', variable: 'SUGGESTIONS_CHANNEL_ID', id: config.channelIds.suggestions, kind: 'text', group: 'Channels', required: true },
    );
  }
  channels.push(
    { label: 'Q&A forum', variable: 'QA_FORUM_CHANNEL_ID', id: config.qa.forumChannelId, kind: 'forum', group: 'Q&A' },
    ...config.qa.channelIds.map(id => ({ label: 'Q&A channel', variable: 'QA_CHANNEL_IDS', id, kind: 'text' as const, group: 'Q&A' as const })),
    { label: 'Q&A alerts', variable: 'QA_ALERT_CHANNEL_ID', id: config.qa.alertChannelId, kind: 'text', group: 'Q&A', required: Boolean(config.qa.forumChannelId || config.qa.channelIds.length) },
    { label: 'Playtest sessions', variable: 'PLAYTEST_SESSIONS_CHANNEL_ID', id: config.channelIds.playtestSessions, kind: 'text', group: 'Playtests' },
    { label: 'Playtest category', variable: 'PLAYTEST_CATEGORY_ID', id: config.channelIds.playtestCategory, kind: 'category', group: 'Playtests' },
    { label: 'Spark reports', variable: 'SPARK_REPORTS_CHANNEL_ID', id: config.channelIds.sparkReports, kind: 'text', group: 'Playtests' },
    { label: 'Verification relay', variable: 'MINECRAFT_VERIFY_RELAY_CHANNEL_ID', id: config.minecraftVerification.relayChannelId, kind: 'text', group: 'Playtests' },
  );
  return channels;
}

async function channelCheck(interaction: SetupInteraction, item: ChannelCheck): Promise<CheckLine> {
  const result = (state: CheckState, detail: string): CheckLine => ({ state, group: item.group, label: item.label,
    detail: `${item.variable}: ${detail}` });
  if (!item.id) {
    return result(item.required ? 'MISSING' : 'OFF', item.required ? 'Set a channel ID.' : 'Optional; not configured.');
  }
  const channel = await interaction.client.channels.fetch(item.id).catch(() => null);
  if (!channel || !('guildId' in channel) || channel.guildId !== interaction.guildId) {
    return result('MISSING', 'Channel not found in this server. Copy its ID with Developer Mode.');
  }
  const validType = item.kind === 'forum' ? channel.type === ChannelType.GuildForum
    : item.kind === 'category' ? channel.type === ChannelType.GuildCategory
    : channel.type === ChannelType.GuildText || channel.type === ChannelType.GuildAnnouncement;
  if (!validType) {
    return result('MISSING', `Must be a Discord ${item.kind === 'text' ? 'text channel' : item.kind}.`);
  }
  const member = interaction.guild?.members.me;
  const permissions = member && 'permissionsFor' in channel ? channel.permissionsFor(member) : null;
  const required = [
    [PermissionsBitField.Flags.ViewChannel, 'View Channel'],
    ...(item.kind === 'category' ? [[PermissionsBitField.Flags.ManageChannels, 'Manage Channels']] as const : [
      [PermissionsBitField.Flags.ReadMessageHistory, 'Read Message History'],
      ...(!item.readOnly ? [
        [item.kind === 'forum' ? PermissionsBitField.Flags.SendMessagesInThreads : PermissionsBitField.Flags.SendMessages,
          item.kind === 'forum' ? 'Send Messages in Threads' : 'Send Messages'],
        [PermissionsBitField.Flags.EmbedLinks, 'Embed Links'],
        ...(item.files ? [[PermissionsBitField.Flags.AttachFiles, 'Attach Files']] as const : []),
        ...(item.kind === 'forum' && item.group !== 'Q&A' ? [[PermissionsBitField.Flags.SendMessages, 'Send Messages']] as const : []),
      ] as const : []),
    ] as const),
  ] as const;
  const missing = required.filter(([flag]) => !permissions?.has(flag)).map(([, label]) => label);
  if (missing.length) {
    return result('MISSING', `Allow ${missing.join(', ')} in <#${item.id}>.`);
  }
  if (item.tags && 'availableTags' in channel) {
    const missingTags = [...new Set(item.tags)].filter(tag => !channel.availableTags.some(available => available.id === tag || available.name.toLowerCase() === tag.toLowerCase()));
    if (missingTags.length) {
      return result('WARN', `Add forum tags or update tag settings: ${missingTags.join(', ')}.`);
    }
  }
  return result('OK', `<#${item.id}> ready.`);
}

function renderChecks(checks: CheckLine[], section: SetupSection) {
  const missing = checks.filter(check => check.state === 'MISSING').length;
  const warnings = checks.filter(check => check.state === 'WARN').length;
  const description = `${missing ? `${missing} item(s) need attention.` : 'No blocking issues found in these checks.'} ${warnings} recommendation(s).\nFix the listed settings in Kinetic environment variables or Discord, restart if settings changed, then run /setup again.`;
  const color = missing ? colors.danger : warnings ? colors.warning : colors.primary;
  const fields: Array<{ name: string; value: string }> = [];
  for (const group of ['Configuration', 'Permissions', 'Channels', 'Q&A', 'Playtests'] as const) {
    let value = '';
    for (const check of checks.filter(check => check.group === group)) {
      const line = `**${check.state} · ${check.label}**\n${check.detail}\n`;
      // Split long fields and pages without discarding findings.
      for (let offset = 0; offset < line.length; offset += 900) {
        const part = line.slice(offset, offset + 900);
        if (value.length + part.length > 1000) { fields.push({ name: group, value }); value = ''; }
        value += part;
      }
    }
    if (value) { fields.push({ name: group, value }); }
  }
  const embeds = [baseEmbed(`Setup check · ${section}`, description).setColor(color)];
  for (const field of fields) {
    let embed = embeds[embeds.length - 1];
    if (embed.length + field.name.length + field.value.length > 5500 || (embed.data.fields?.length ?? 0) === 25) {
      embed = baseEmbed(`Setup check · ${section} (continued)`, description).setColor(color);
      embeds.push(embed);
    }
    embed.addFields(field);
  }
  return embeds;
}
