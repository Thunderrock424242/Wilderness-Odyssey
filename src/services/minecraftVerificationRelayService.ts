import type { Message } from 'discord.js';
import { z } from 'zod';
import { config } from '../config';
import { baseEmbed } from '../utils/embeds';
import { logger } from '../utils/logger';
import { completeMinecraftLink } from './minecraftVerificationService';

const relayPayloadSchema = z.object({
  type: z.literal('wo_minecraft_verify'),
  code: z.string().trim().min(1),
  minecraftUuid: z.string().trim().min(1),
  minecraftName: z.string().trim().min(1)
}).strict();

type RelayPayload = z.infer<typeof relayPayloadSchema>;

export async function handleMinecraftVerificationRelayMessage(message: Message): Promise<boolean> {
  const relayChannelId = config.minecraftVerification.relayChannelId;
  if (!relayChannelId || message.channelId !== relayChannelId) {
    return false;
  }

  if (!message.guild) {
    return true;
  }

  if (!message.webhookId) {
    logger.warn({
      channelId: message.channelId,
      messageId: message.id,
      authorId: message.author.id
    }, 'Ignored non-webhook Minecraft verification relay message.');
    return true;
  }

  if (
    config.minecraftVerification.relayWebhookId
    && message.webhookId !== config.minecraftVerification.relayWebhookId
  ) {
    logger.warn({
      channelId: message.channelId,
      messageId: message.id,
      webhookId: message.webhookId
    }, 'Ignored Minecraft verification relay message from unexpected webhook.');
    return true;
  }

  const parsed = parseRelayPayload(message.content);
  if (!parsed.ok) {
    await sendRelayStatus(message, false, `Invalid verification payload: ${parsed.reason}`);
    return true;
  }

  const result = completeMinecraftLink({
    code: parsed.payload.code,
    minecraftUuid: parsed.payload.minecraftUuid,
    minecraftName: parsed.payload.minecraftName
  });

  if (!result.ok) {
    await sendRelayStatus(message, false, result.reason);
    return true;
  }

  const roleNote = await grantVerifiedRole(message, result.link.userId);
  await notifyLinkedUser(message, result.link.userId, result.link.minecraftName, result.link.minecraftUuid);

  await sendRelayStatus(
    message,
    true,
    [
      `Linked <@${result.link.userId}> to **${result.link.minecraftName}**.`,
      `UUID: \`${result.link.minecraftUuid}\``,
      roleNote
    ].filter(Boolean).join('\n')
  );

  return true;
}

function parseRelayPayload(content: string): { ok: true; payload: RelayPayload } | { ok: false; reason: string } {
  const jsonText = stripCodeFence(content.trim());
  if (!jsonText) {
    return { ok: false, reason: 'message content is empty' };
  }

  let decoded: unknown;
  try {
    decoded = JSON.parse(jsonText);
  } catch {
    return { ok: false, reason: 'message content is not valid JSON' };
  }

  const parsed = relayPayloadSchema.safeParse(decoded);
  if (!parsed.success) {
    return { ok: false, reason: parsed.error.issues.map((issue) => issue.message).join('; ') };
  }

  return { ok: true, payload: parsed.data };
}

function stripCodeFence(content: string): string {
  if (!content.startsWith('```')) {
    return content;
  }

  return content
    .replace(/^```(?:json)?\s*/i, '')
    .replace(/\s*```$/u, '')
    .trim();
}

async function grantVerifiedRole(message: Message, userId: string): Promise<string | null> {
  const roleId = config.minecraftVerification.verifiedRoleId;
  if (!roleId || !message.guild) {
    return null;
  }

  const member = await message.guild.members.fetch(userId).catch(() => null);
  if (!member) {
    return `Configured verified role <@&${roleId}> was not added because the user is not in this server.`;
  }

  const added = await member.roles
    .add(roleId, 'Minecraft verification completed through server relay')
    .then(() => true)
    .catch((error) => {
      logger.warn({ error, userId, roleId }, 'Failed to add Minecraft verified role.');
      return false;
    });

  return added
    ? `Added verified role <@&${roleId}>.`
    : `Minecraft link was saved, but I could not add verified role <@&${roleId}>.`;
}

async function notifyLinkedUser(
  message: Message,
  userId: string,
  minecraftName: string,
  minecraftUuid: string
): Promise<void> {
  const user = await message.client.users.fetch(userId).catch(() => null);
  if (!user) {
    return;
  }

  await user.send({
    embeds: [
      baseEmbed('Minecraft Verification Complete', `Your Discord account is now linked to **${minecraftName}**.`)
        .addFields({ name: 'Minecraft UUID', value: `\`${minecraftUuid}\`` })
    ]
  }).catch((error) => {
    logger.debug({ error, userId }, 'Could not DM Minecraft verification confirmation.');
  });
}

async function sendRelayStatus(message: Message, ok: boolean, details: string): Promise<void> {
  if (!message.channel.isSendable()) {
    return;
  }

  await message.channel.send({
    embeds: [
      baseEmbed(ok ? 'Minecraft Verification Linked' : 'Minecraft Verification Rejected', details)
        .setColor(ok ? 0x4f9d69 : 0xe06c75)
    ],
    allowedMentions: { parse: [] }
  }).catch((error) => {
    logger.warn({ error, channelId: message.channelId }, 'Failed to send Minecraft verification relay status.');
  });
}
