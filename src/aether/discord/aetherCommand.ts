import { randomUUID } from 'node:crypto';
import { SlashCommandBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { config } from '../../config';
import type { SlashCommand } from '../../types';
import { baseEmbed, truncate } from '../../utils/embeds';
import { getAetherCore, getAetherStatus } from '../index';
import type {
  AetherPrivacyMode,
  AetherResponseDetail,
  AetherUserPreferences
} from '../memory';
import { aetherLabel } from '../presentation';
import type { AetherAgentName, AetherAttachment, AetherRequest } from '../types';
import { readDiagnosticAttachment } from './diagnosticAttachment';

export const aetherCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('aether')
    .setDescription('Use the optional Aether Core assistant modules.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('help')
        .setDescription('Show Aether commands and what each module does.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('ask')
        .setDescription('Route a question to the best Aether module.')
        .addStringOption((option) =>
          option
            .setName('question')
            .setDescription('The question or message for Aether.')
            .setMinLength(1)
            .setMaxLength(2000)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Show safe Aether provider and module availability.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('lore')
        .setDescription('Search the configured Aether lore archive.')
        .addStringOption((option) =>
          option
            .setName('query')
            .setDescription('The lore topic to search for.')
            .setMinLength(1)
            .setMaxLength(1000)
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('diagnose')
        .setDescription('Safely analyze a supported text log or crash report.')
        .addAttachmentOption((option) =>
          option
            .setName('file')
            .setDescription('A supported text log or crash-report attachment.')
            .setRequired(true)
        )
        .addStringOption((option) =>
          option
            .setName('context')
            .setDescription('What happened before the error.')
            .setMaxLength(1000)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('link')
        .setDescription('Create a short-lived code for Minecraft UUID linking.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unlink')
        .setDescription('Remove your linked Minecraft account after confirmation.')
        .addBooleanOption((option) =>
          option
            .setName('confirm')
            .setDescription('Confirm that your Minecraft link should be removed.')
            .setRequired(true)
        )
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('profile')
        .setDescription('Show your private Aether profile and Minecraft link.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('settings')
        .setDescription('View or update your private Aether preferences.')
        .addBooleanOption((option) =>
          option
            .setName('conversation_memory')
            .setDescription('Allow Aether to retain short conversation summaries.')
        )
        .addBooleanOption((option) =>
          option
            .setName('minecraft_notifications')
            .setDescription('Allow supported Minecraft notifications when connected.')
        )
        .addStringOption((option) =>
          option
            .setName('response_detail')
            .setDescription('Choose how detailed Aether responses should be.')
            .addChoices(
              { name: 'Concise', value: 'concise' },
              { name: 'Standard', value: 'standard' },
              { name: 'Detailed', value: 'detailed' }
            )
        )
        .addStringOption((option) =>
          option
            .setName('privacy')
            .setDescription('Choose the supported Aether privacy mode.')
            .addChoices(
              { name: 'Private', value: 'private' },
              { name: 'Minimal', value: 'minimal' }
            )
        )
    ),
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand(true);
    if (subcommand === 'help') {
      await interaction.reply({ embeds: [helpEmbed()], flags: 'Ephemeral' });
      return;
    }

    if (subcommand === 'status') {
      await interaction.reply({ embeds: [statusEmbed()], flags: 'Ephemeral' });
      return;
    }

    const core = getAetherCore();
    if (!core?.isOperational()) {
      await interaction.reply({
        content: 'Aether Core is disabled or unavailable. Existing Wilderness Odyssey commands remain online.',
        flags: 'Ephemeral'
      });
      return;
    }

    if (
      ['link', 'unlink', 'profile', 'settings'].includes(subcommand)
      && !core.getStatus().memoryProvider.available
    ) {
      await interaction.reply({
        content: 'Aether memory is disabled or unavailable, so profile, settings, and Minecraft-link operations are not available. Other Aether routing remains online.',
        flags: 'Ephemeral'
      });
      return;
    }

    if (subcommand === 'ask') {
      await routeQuestion(
        interaction,
        interaction.options.getString('question', true),
        undefined,
        []
      );
      return;
    }

    if (subcommand === 'lore') {
      await routeQuestion(
        interaction,
        interaction.options.getString('query', true),
        'lore',
        []
      );
      return;
    }

    if (subcommand === 'diagnose') {
      await interaction.deferReply({ flags: 'Ephemeral' });
      try {
        const attachment = await readDiagnosticAttachment(
          interaction.options.getAttachment('file', true),
          {
            maximumBytes: config.aether.maximumAttachmentSize,
            allowedFileTypes: config.aether.allowedDiagnosticFileTypes
          }
        );
        const response = await core.routeRequest(buildRequest(
          interaction,
          interaction.options.getString('context') ?? 'Analyze the attached crash report or log.',
          'diagnostics',
          [attachment]
        ));
        await interaction.editReply({ embeds: [responseEmbed(response.agentName, response.responseText)] });
      } catch (error) {
        await interaction.editReply({
          content: error instanceof Error
            ? error.message
            : 'The attachment could not be analyzed safely.'
        });
      }
      return;
    }

    if (subcommand === 'link') {
      const code = core.createLinkCode({
        discordUserId: interaction.user.id,
        username: interaction.user.tag
      });
      await interaction.reply({
        embeds: [
          baseEmbed(aetherLabel('core'), 'A one-time Minecraft link code is ready.')
            .addFields(
              { name: 'Code', value: `\`${code.code}\``, inline: true },
              { name: 'Expires', value: `<t:${Math.floor(new Date(code.expiresAt).getTime() / 1000)}:R>`, inline: true },
              { name: 'In Minecraft', value: `Run \`/wo link ${code.code}\` on the trusted server or integrated-server bridge.` },
              { name: 'Identity', value: 'The completed link is stored against your Minecraft UUID, not your changeable username.' }
            )
        ],
        flags: 'Ephemeral'
      });
      return;
    }

    if (subcommand === 'unlink') {
      if (!interaction.options.getBoolean('confirm', true)) {
        await interaction.reply({
          content: 'Nothing was removed. Run `/aether unlink confirm:true` when you are ready.',
          flags: 'Ephemeral'
        });
        return;
      }

      const removed = core.unlink(interaction.user.id);
      await interaction.reply({
        content: removed
          ? 'Your Minecraft account association was removed from Aether and the existing verification store.'
          : 'You do not currently have a linked Minecraft account.',
        flags: 'Ephemeral'
      });
      return;
    }

    if (subcommand === 'profile') {
      const profile = core.getProfile({
        requesterUserId: interaction.user.id,
        targetUserId: interaction.user.id,
        permissions: ['profile:self']
      });
      await interaction.reply({ embeds: [profileEmbed(profile)], flags: 'Ephemeral' });
      return;
    }

    const preferences: Partial<AetherUserPreferences> = {};
    const conversationMemory = interaction.options.getBoolean('conversation_memory');
    const minecraftNotifications = interaction.options.getBoolean('minecraft_notifications');
    const responseDetail = interaction.options.getString('response_detail') as AetherResponseDetail | null;
    const privacyMode = interaction.options.getString('privacy') as AetherPrivacyMode | null;
    if (conversationMemory !== null) preferences.conversationMemoryEnabled = conversationMemory;
    if (minecraftNotifications !== null) preferences.minecraftNotificationsEnabled = minecraftNotifications;
    if (responseDetail) preferences.responseDetail = responseDetail;
    if (privacyMode) preferences.privacyMode = privacyMode;

    const updated = Object.keys(preferences).length > 0
      ? core.updatePreferences({
        requesterUserId: interaction.user.id,
        targetUserId: interaction.user.id,
        permissions: ['settings:self'],
        preferences
      })
      : core.getProfile({
        requesterUserId: interaction.user.id,
        targetUserId: interaction.user.id,
        permissions: ['profile:self']
      }).preferences;
    await interaction.reply({ embeds: [settingsEmbed(updated)], flags: 'Ephemeral' });
  }
};

async function routeQuestion(
  interaction: ChatInputCommandInteraction,
  message: string,
  agentHint: AetherAgentName | undefined,
  attachments: AetherAttachment[]
): Promise<void> {
  await interaction.deferReply({ flags: 'Ephemeral' });
  const response = await getAetherCore()!.routeRequest(
    buildRequest(interaction, message, agentHint, attachments)
  );
  await interaction.editReply({ embeds: [responseEmbed(response.agentName, response.responseText)] });
}

function buildRequest(
  interaction: ChatInputCommandInteraction,
  message: string,
  agentHint: AetherAgentName | undefined,
  attachments: AetherAttachment[]
): AetherRequest {
  return {
    requestId: randomUUID(),
    sourcePlatform: 'discord',
    userIdentity: {
      platformUserId: interaction.user.id,
      displayName: interaction.user.tag
    },
    guildOrServerId: interaction.guildId ?? undefined,
    message,
    attachments,
    permissions: ['profile:self', 'settings:self'],
    timestamp: new Date().toISOString(),
    agentHint
  };
}

function helpEmbed() {
  return baseEmbed(aetherLabel('core'), 'Aether is an optional internal module inside the existing Wilderness Odyssey bot.')
    .addFields(
      { name: '/aether ask', value: 'Routes a question to the best internal Aether agent.' },
      { name: '/aether status', value: 'Shows safe provider, memory, bridge, and agent availability.' },
      { name: '/aether lore', value: 'Searches the configured lore source.' },
      { name: '/aether diagnose', value: 'Validates, redacts, and analyzes a supported text attachment without executing it.' },
      { name: '/aether link · unlink · profile', value: 'Manages your private Discord-to-Minecraft UUID association.' },
      { name: '/aether settings', value: 'Manages opt-in memory, notifications, response detail, and privacy preferences.' }
    );
}

function statusEmbed() {
  const status = getAetherStatus();
  const agentStatus = status.agents.length > 0
    ? status.agents.map((agent) => `${agent.available ? 'Online' : 'Offline'}: ${agent.name}`).join('\n')
    : 'No agents initialized.';
  return baseEmbed(aetherLabel('core'), 'Aether component status. Sensitive values and internal addresses are never displayed.')
    .addFields(
      { name: 'Core', value: status.enabled ? 'Enabled and initialized' : 'Disabled or unavailable', inline: true },
      {
        name: 'AI provider',
        value: status.aiProvider.available
          ? `${status.aiProvider.name} available`
          : `${status.aiProvider.name} unavailable; scripted fallback ready`,
        inline: true
      },
      { name: 'Memory', value: `${status.memoryProvider.name}: ${status.memoryProvider.available ? 'available' : 'unavailable'}`, inline: true },
      { name: 'Minecraft bridge', value: `${status.minecraftBridge.name}: ${status.minecraftBridge.available ? 'available' : 'disabled/unavailable'}`, inline: true },
      { name: 'Internal agents', value: truncate(agentStatus, 1024) },
      {
        name: 'Configuration',
        value: status.configurationIssues.length > 0
          ? `${status.configurationIssues.length} safe configuration warning(s); check bot logs.`
          : status.failureReason ?? 'No Aether configuration warnings.'
      }
    );
}

function responseEmbed(agentName: AetherAgentName, responseText: string) {
  return baseEmbed(aetherLabel(agentName), truncate(responseText, 4000));
}

function profileEmbed(profile: ReturnType<NonNullable<ReturnType<typeof getAetherCore>>['getProfile']>) {
  return baseEmbed(aetherLabel('core'), 'Your private Aether profile.')
    .addFields(
      {
        name: 'Minecraft identity',
        value: profile.minecraftLink
          ? `**${profile.minecraftLink.minecraftName}**\nUUID: \`${profile.minecraftLink.minecraftUuid}\``
          : 'Not linked.'
      },
      { name: 'Conversation memory', value: profile.preferences.conversationMemoryEnabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Minecraft notifications', value: profile.preferences.minecraftNotificationsEnabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Response detail', value: profile.preferences.responseDetail, inline: true },
      { name: 'Privacy mode', value: profile.preferences.privacyMode, inline: true }
    );
}

function settingsEmbed(preferences: AetherUserPreferences) {
  return baseEmbed(aetherLabel('core'), 'Your Aether preferences.')
    .addFields(
      { name: 'Conversation memory', value: preferences.conversationMemoryEnabled ? 'Enabled (summaries only)' : 'Disabled', inline: true },
      { name: 'Minecraft notifications', value: preferences.minecraftNotificationsEnabled ? 'Enabled' : 'Disabled', inline: true },
      { name: 'Response detail', value: preferences.responseDetail, inline: true },
      { name: 'Privacy mode', value: preferences.privacyMode, inline: true }
    );
}
