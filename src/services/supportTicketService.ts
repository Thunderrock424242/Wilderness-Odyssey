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
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { config } from '../config';
import { baseEmbed } from '../utils/embeds';
import { isStaff } from '../utils/permissions';
import { supportTeamAllowedMentions, supportTeamPing } from '../utils/supportTeam';
import { buildTicketTranscript, postStaffLog, postTicketTranscript, sendTicketTranscriptToUser } from './staffLogService';

type SupportTicketStartInteraction = ChatInputCommandInteraction | ButtonInteraction | StringSelectMenuInteraction;
type TicketParentInteraction = ModalSubmitInteraction | SupportTicketStartInteraction;

interface TicketParentResult {
  parentId?: string;
  error?: string;
}

const ticketCreateCustomId = 'support-ticket:create';
const ticketButtonPrefix = 'support-ticket:';

export async function beginOtherHelpTicket(interaction: SupportTicketStartInteraction): Promise<void> {
  await interaction.showModal(new ModalBuilder()
    .setCustomId(ticketCreateCustomId)
    .setTitle('Other Help')
    .addComponents(
      ticketTextInputRow('summary', 'Short summary', TextInputStyle.Short, true, 'Example: I cannot import the playtest ZIP'),
      ticketTextInputRow('details', 'What do you need help with?', TextInputStyle.Paragraph, true, 'Include what you tried, errors you saw, and screenshots/logs you can share.')
    ));
}

export async function handleSupportTicketModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (interaction.customId !== ticketCreateCustomId) {
    return false;
  }

  await createOtherHelpTicket({
    interaction,
    summary: interaction.fields.getTextInputValue('summary'),
    details: interaction.fields.getTextInputValue('details')
  });
  return true;
}

export async function handleSupportTicketButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith(ticketButtonPrefix)) {
    return false;
  }

  if (!isSupportTeamMember(interaction)) {
    await interaction.reply({
      content: 'This ticket control is for staff/support only.',
      flags: 'Ephemeral'
    });
    return true;
  }

  const action = interaction.customId.slice(ticketButtonPrefix.length);

  if (action === 'claim') {
    await postStaffLog(interaction.client, {
      title: 'Ticket Claimed',
      description: 'Private ticket claimed by staff.',
      fields: [
        { name: 'Channel', value: `<#${interaction.channelId}> (${interaction.channelId})`, inline: true },
        { name: 'Claimed by', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true }
      ]
    });
    await interaction.reply({
      content: `All set. Ticket claimed by <@${interaction.user.id}>.`,
      allowedMentions: { users: [interaction.user.id] }
    });
    return true;
  }

  if (action === 'close') {
    await closeTicket(interaction);
    return true;
  }

  if (action.startsWith('route:')) {
    const target = action.slice('route:'.length);
    await postStaffLog(interaction.client, {
      title: 'Ticket Route Suggested',
      description: `Private ticket routed toward **${target}**.`,
      fields: [
        { name: 'Channel', value: `<#${interaction.channelId}> (${interaction.channelId})`, inline: true },
        { name: 'Staff', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true }
      ]
    });
    await interaction.reply({
      content: routeInstructions(target),
      flags: 'Ephemeral'
    });
    return true;
  }

  return true;
}

async function createOtherHelpTicket(input: {
  interaction: ModalSubmitInteraction;
  summary: string;
  details: string;
}): Promise<void> {
  const { interaction, summary, details } = input;

  if (!interaction.guild) {
    await interaction.reply({
      content: 'I can only create Other Help tickets inside the Discord server.',
      flags: 'Ephemeral'
    });
    return;
  }

  const botMember = interaction.guild.members.me;
  if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    await interaction.reply({
      content: 'I need the Manage Channels permission before I can create private support tickets. Staff can fix that permission and try again.',
      flags: 'Ephemeral'
    });
    return;
  }

  const parent = await resolveSupportTicketParentId(interaction);
  if (parent.error) {
    await interaction.reply({
      content: `${parent.error} Please fix \`SUPPORT_TICKET_CATEGORY_ID\` or run this from a channel inside the private support category.`,
      flags: 'Ephemeral'
    });
    return;
  }

  const channel = await interaction.guild.channels.create({
    name: ticketChannelName('help', interaction.user.username),
    type: ChannelType.GuildText,
    parent: parent.parentId,
    topic: `Other Help ticket for ${interaction.user.tag} (${interaction.user.id})`,
    reason: `Other Help ticket opened by ${interaction.user.tag}`,
    permissionOverwrites: ticketPermissionOverwrites(interaction.guild.roles.everyone.id, interaction.user.id, botMember.id)
  });

  await channel.send({
    content: supportTeamPing(`Other Help ticket opened by <@${interaction.user.id}>.`),
    allowedMentions: supportTeamAllowedMentions(),
    embeds: [
      baseEmbed('Other Help Ticket', summary)
        .addFields(
          { name: 'Player', value: `<@${interaction.user.id}>`, inline: true },
          { name: 'Details', value: details.slice(0, 1024) },
          { name: 'Staff note', value: 'Use the routing buttons if this should become a structured public report.' }
        )
    ],
    components: ticketControlRows()
  });

  await postStaffLog(interaction.client, {
    title: 'Ticket Created',
    description: 'Private Other Help ticket opened.',
    fields: [
      { name: 'Channel', value: `<#${channel.id}> (${channel.id})`, inline: true },
      { name: 'Player', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true },
      { name: 'Summary', value: summary }
    ]
  });

  await interaction.reply({
    content: `I created your private support ticket: <#${channel.id}>. Staff can help you there.`,
    flags: 'Ephemeral'
  });
}

export function ticketPermissionOverwrites(everyoneRoleId: string, userId: string, botUserId: string) {
  return [
    {
      id: everyoneRoleId,
      deny: [PermissionsBitField.Flags.ViewChannel]
    },
    {
      id: userId,
      allow: ticketPermissions()
    },
    {
      id: botUserId,
      allow: [
        ...ticketPermissions(),
        PermissionsBitField.Flags.ManageChannels,
        PermissionsBitField.Flags.ManageMessages
      ]
    },
    ...(config.support.teamRoleId
      ? [{
        id: config.support.teamRoleId,
        allow: [
          ...ticketPermissions(),
          PermissionsBitField.Flags.ManageMessages
        ]
      }]
      : [])
  ];
}

export function ticketControlRows(): ActionRowBuilder<ButtonBuilder>[] {
  return [
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ticketButtonPrefix}claim`)
        .setLabel('Claim')
        .setStyle(ButtonStyle.Primary),
      new ButtonBuilder()
        .setCustomId(`${ticketButtonPrefix}close`)
        .setLabel('Close')
        .setStyle(ButtonStyle.Secondary)
    ),
    new ActionRowBuilder<ButtonBuilder>().addComponents(
      new ButtonBuilder()
        .setCustomId(`${ticketButtonPrefix}route:bug`)
        .setLabel('Move to Bug')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${ticketButtonPrefix}route:suggestion`)
        .setLabel('Move to Suggestion')
        .setStyle(ButtonStyle.Secondary),
      new ButtonBuilder()
        .setCustomId(`${ticketButtonPrefix}route:feedback`)
        .setLabel('Move to Feedback')
        .setStyle(ButtonStyle.Secondary)
    )
  ];
}

export function ticketChannelName(prefix: string, username: string): string {
  const slug = username
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 64);
  return `${prefix}-${slug || 'player'}-${randomUUID().slice(0, 6)}`;
}

export async function resolveSupportTicketParentId(interaction: TicketParentInteraction): Promise<TicketParentResult> {
  const configuredParent = config.channelIds.supportTicketCategory;
  if (configuredParent) {
    return supportTicketCategoryResult(interaction, configuredParent, '`SUPPORT_TICKET_CATEGORY_ID`');
  }

  const currentParent = currentParentId(interaction);
  if (!currentParent) {
    return {};
  }

  return supportTicketCategoryResult(interaction, currentParent, 'the current channel parent');
}

async function supportTicketCategoryResult(
  interaction: TicketParentInteraction,
  channelId: string,
  source: string
): Promise<TicketParentResult> {
  const channel = await interaction.client.channels.fetch(channelId).catch(() => null);
  if (!channel) {
    return { error: `${source} is set to ${channelId}, but I cannot find that channel.` };
  }

  if (channel.type !== ChannelType.GuildCategory) {
    return {
      error: `${source} points at <#${channelId}>, but private crash/help channels need a Discord category as their parent.`
    };
  }

  return { parentId: channel.id };
}

function ticketPermissions() {
  return [
    PermissionsBitField.Flags.ViewChannel,
    PermissionsBitField.Flags.SendMessages,
    PermissionsBitField.Flags.ReadMessageHistory,
    PermissionsBitField.Flags.AttachFiles,
    PermissionsBitField.Flags.EmbedLinks
  ];
}

function currentParentId(interaction: TicketParentInteraction): string | null {
  return interaction.channel && 'parentId' in interaction.channel ? interaction.channel.parentId : null;
}

function ticketTextInputRow(
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

function isSupportTeamMember(interaction: ButtonInteraction): boolean {
  if (isStaff(interaction)) {
    return true;
  }

  const roleId = config.support.teamRoleId;
  if (!roleId || !interaction.member || !('roles' in interaction.member)) {
    return false;
  }

  const roles = interaction.member.roles;
  if (Array.isArray(roles)) {
    return roles.includes(roleId);
  }

  return 'cache' in roles && roles.cache.has(roleId);
}

async function closeTicket(interaction: ButtonInteraction): Promise<void> {
  const channel = interaction.channel;
  if (!channel || channel.type !== ChannelType.GuildText) {
    await interaction.reply({ content: 'This ticket control only works in a server text channel.', flags: 'Ephemeral' });
    return;
  }

  await interaction.deferReply({ flags: 'Ephemeral' });

  const userId = ticketOwnerId(channel.topic);
  if (!userId) {
    await interaction.editReply('I could not find the ticket owner in the channel topic, so I kept this ticket open.');
    return;
  }

  const transcript = await buildTicketTranscript(channel).catch(() => null);
  if (!transcript) {
    await interaction.editReply('I could not build the ticket transcript, so I kept this ticket open.');
    return;
  }

  const transcriptPosted = await postTicketTranscript(channel, {
    closedById: interaction.user.id,
    closedByTag: interaction.user.tag,
    transcript
  }).catch(() => false);

  if (!transcriptPosted) {
    await interaction.editReply('I could not post the transcript to `STAFF_LOG_CHANNEL_ID`, so I kept this ticket open.');
    return;
  }

  const transcriptSentToUser = await sendTicketTranscriptToUser(interaction.client, userId, channel, transcript);
  if (!transcriptSentToUser) {
    await interaction.editReply('Transcript posted to the staff log, but I could not DM it to the ticket owner, so I kept this ticket open.');
    return;
  }

  await interaction.editReply('Transcript posted to the staff log and sent to the ticket owner. Closing this ticket channel now.');

  await channel.delete(`Ticket closed by ${interaction.user.tag}; transcript posted to staff log and sent to ticket owner.`)
    .catch(async () => {
      await interaction.followUp({
        content: 'The transcript was posted, but I could not delete the ticket channel. Please check my Manage Channels permission.',
        flags: 'Ephemeral'
      });
    });
}

function ticketOwnerId(topic: string | null): string | null {
  return topic?.match(/\((\d+)\)/)?.[1] ?? null;
}

function routeInstructions(target: string): string {
  if (target === 'bug') {
    return [
      'Route this to a bug report if it is reproducible broken gameplay or content.',
      'Ask the player to click **Bug** in the Support Hub so the public forum post has the required fields.',
      'Keep this ticket open for private context until the bug report ID is created.'
    ].join('\n');
  }

  if (target === 'suggestion') {
    return [
      'Route this to a suggestion if it is a new idea or quality-of-life request.',
      'Ask the player to click **Suggestion** in the Support Hub so the public suggestion post is created with voting buttons.'
    ].join('\n');
  }

  return [
    'Route this to feedback if it is an opinion, balance note, pacing concern, or playtest impression.',
    'Ask the player to click **Feedback** in the Support Hub so it lands in the feedback/suggestion forum with the right tag.'
  ].join('\n');
}
