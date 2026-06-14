import type { Client, Message, MessageCreateOptions, TextChannel } from 'discord.js';
import { AttachmentBuilder } from 'discord.js';
import { config } from '../config';
import { baseEmbed } from '../utils/embeds';
import { logger } from '../utils/logger';

interface StaffLogField {
  name: string;
  value: string;
  inline?: boolean;
}

export async function postStaffLog(
  client: Client,
  input: {
    title: string;
    description?: string;
    fields?: StaffLogField[];
    files?: MessageCreateOptions['files'];
  }
): Promise<boolean> {
  if (!config.channelIds.staffLog) {
    return false;
  }

  const embed = baseEmbed(input.title, input.description)
    .setColor(0x6d5b98);

  if (input.fields?.length) {
    embed.addFields(
      input.fields.map((field) => ({
        ...field,
        value: field.value.slice(0, 1024) || 'n/a'
      }))
    );
  }

  const channel = await client.channels.fetch(config.channelIds.staffLog).catch(() => null);
  const posted = Boolean(channel?.isSendable() && await channel.send({
    embeds: [embed],
    files: input.files,
    allowedMentions: { parse: [] }
  }).then(() => true).catch(() => false));

  if (!posted) {
    logger.warn({ title: input.title, channelId: config.channelIds.staffLog }, 'Failed to post staff log event.');
  }

  return posted;
}

export async function postTicketTranscript(
  channel: TextChannel,
  input: {
    closedById: string;
    closedByTag: string;
    transcript?: string;
  }
): Promise<boolean> {
  const transcript = input.transcript ?? await buildTicketTranscript(channel);

  return postStaffLog(channel.client, {
    title: 'Ticket Closed',
    description: `Transcript archived for #${channel.name}.`,
    fields: [
      { name: 'Channel', value: `<#${channel.id}> (${channel.id})`, inline: true },
      { name: 'Closed by', value: `<@${input.closedById}> (${input.closedByTag})`, inline: true },
      { name: 'Topic', value: channel.topic ?? 'No topic set.' }
    ],
    files: [ticketTranscriptAttachment(channel, transcript)]
  });
}

export async function sendTicketTranscriptToUser(
  client: Client,
  userId: string,
  channel: TextChannel,
  transcript: string
): Promise<boolean> {
  const user = await client.users.fetch(userId).catch(() => null);
  if (!user) {
    return false;
  }

  return user.send({
    embeds: [
      baseEmbed('Ticket Transcript', `Your private support ticket **#${channel.name}** has been closed.`)
        .addFields(
          { name: 'Server', value: channel.guild.name, inline: true },
          { name: 'Channel ID', value: channel.id, inline: true }
        )
    ],
    files: [ticketTranscriptAttachment(channel, transcript)],
    allowedMentions: { parse: [] }
  }).then(() => true).catch(() => false);
}

export async function buildTicketTranscript(channel: TextChannel): Promise<string> {
  const messages = await fetchTranscriptMessages(channel);
  const lines = [
    `Transcript for #${channel.name} (${channel.id})`,
    `Guild: ${channel.guild.name} (${channel.guild.id})`,
    `Topic: ${channel.topic ?? 'No topic set.'}`,
    `Generated: ${new Date().toISOString()}`,
    `Messages: ${messages.length}`,
    ''
  ];

  for (const message of messages) {
    lines.push(formatMessageForTranscript(message));
  }

  return lines.join('\n');
}

async function fetchTranscriptMessages(channel: TextChannel): Promise<Message[]> {
  const messages: Message[] = [];
  let before: string | undefined;

  while (messages.length < 1000) {
    const page = await channel.messages.fetch({ limit: 100, before });
    if (page.size === 0) {
      break;
    }

    messages.push(...page.values());
    before = page.last()?.id;
  }

  return messages.sort((a, b) => a.createdTimestamp - b.createdTimestamp);
}

function formatMessageForTranscript(message: Message): string {
  const parts = [
    `[${message.createdAt.toISOString()}] ${message.author.tag} (${message.author.id})`
  ];

  if (message.content.trim()) {
    parts.push(message.content);
  }

  for (const attachment of message.attachments.values()) {
    parts.push(`[attachment] ${attachment.name} ${attachment.url}`);
  }

  for (const embed of message.embeds) {
    parts.push(formatEmbedForTranscript(embed));
  }

  return `${parts.join('\n')}\n`;
}

function formatEmbedForTranscript(embed: Message['embeds'][number]): string {
  const lines = ['[embed]'];

  if (embed.title) {
    lines.push(`title: ${embed.title}`);
  }

  if (embed.description) {
    lines.push(`description: ${embed.description}`);
  }

  for (const field of embed.fields) {
    lines.push(`${field.name}: ${field.value}`);
  }

  return lines.join('\n');
}

function ticketTranscriptAttachment(channel: TextChannel, transcript: string): AttachmentBuilder {
  return new AttachmentBuilder(Buffer.from(transcript, 'utf8'), {
    name: `${safeFileName(channel.name)}-${channel.id}-transcript.txt`,
    description: 'Private ticket transcript.'
  });
}

function safeFileName(value: string): string {
  return value
    .toLowerCase()
    .replace(/[^a-z0-9-]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 60) || 'ticket';
}
