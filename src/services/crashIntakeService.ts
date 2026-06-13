import {
  ButtonInteraction,
  ChannelType,
  Message,
  PermissionsBitField,
  StringSelectMenuInteraction
} from 'discord.js';
import { LRUCache } from 'lru-cache';
import { config } from '../config';
import { baseEmbed } from '../utils/embeds';
import { reportReceiptButtons } from './reportService';
import { archiveCrashAttachment } from './crashReportService';
import {
  ticketChannelName,
  ticketControlRows,
  ticketPermissionOverwrites
} from './supportTicketService';

type CrashIntakeInteraction = ButtonInteraction | StringSelectMenuInteraction;

interface PendingCrashIntake {
  userId: string;
  expiresAt: number;
}

const crashIntakeTtlMs = 15 * 60_000;
const pendingCrashIntakes = new LRUCache<string, PendingCrashIntake>({
  max: 200,
  ttl: crashIntakeTtlMs
});

export async function beginCrashUploadIntake(interaction: CrashIntakeInteraction): Promise<void> {
  if (!interaction.guild) {
    await interaction.reply({
      content: 'Crash upload intake can only be created inside the Discord server.',
      flags: 'Ephemeral'
    });
    return;
  }

  const botMember = interaction.guild.members.me;
  if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    await interaction.reply({
      content: 'I need the Manage Channels permission before I can create a private crash upload channel. Use `/crash file:` for now.',
      flags: 'Ephemeral'
    });
    return;
  }

  const parent = config.channelIds.supportTicketCategory
    ?? (interaction.channel && 'parentId' in interaction.channel ? interaction.channel.parentId : null)
    ?? undefined;
  const channel = await interaction.guild.channels.create({
    name: ticketChannelName('crash', interaction.user.username),
    type: ChannelType.GuildText,
    parent,
    topic: `Crash upload intake for ${interaction.user.tag} (${interaction.user.id})`,
    reason: `Crash upload intake opened by ${interaction.user.tag}`,
    permissionOverwrites: ticketPermissionOverwrites(interaction.guild.roles.everyone.id, interaction.user.id, botMember.id)
  });

  pendingCrashIntakes.set(channel.id, {
    userId: interaction.user.id,
    expiresAt: Date.now() + crashIntakeTtlMs
  });

  await channel.send({
    content: `<@${interaction.user.id}>`,
    allowedMentions: { users: [interaction.user.id] },
    embeds: [
      baseEmbed('Crash Upload', 'Upload your `latest.log` or crash report here.')
        .addFields(
          { name: 'Accepted files', value: '`.log` or `.txt` files.' },
          { name: 'What happens next', value: 'I will redact sensitive values, analyze common crash signatures, create the public crash forum post, and ping support.' },
          { name: 'Fallback', value: 'You can also use `/crash file:<log>` if you prefer slash commands.' }
        )
    ],
    components: ticketControlRows()
  });

  await interaction.reply({
    content: `Created a private crash upload channel: <#${channel.id}>. Upload your log there.`,
    flags: 'Ephemeral'
  });
}

export async function handleCrashIntakeMessage(message: Message): Promise<boolean> {
  if (message.author.bot || !message.guild) {
    return false;
  }

  const pending = pendingCrashIntakes.get(message.channelId);
  if (!pending) {
    return false;
  }

  if (Date.now() > pending.expiresAt) {
    pendingCrashIntakes.delete(message.channelId);
    await message.reply({
      content: 'This crash upload session expired. Click **Crash** in the Support Hub again.',
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  if (message.author.id !== pending.userId) {
    return false;
  }

  const attachment = message.attachments.first();
  if (!attachment) {
    await message.reply({
      content: 'Attach your `latest.log`, crash report, `.log`, or `.txt` file in this channel.',
      allowedMentions: { repliedUser: false }
    });
    return true;
  }

  try {
    const result = await archiveCrashAttachment({
      client: message.client,
      user: message.author,
      attachment
    });

    pendingCrashIntakes.delete(message.channelId);
    await message.reply({
      content: result.posted
        ? `Crash report created as **${result.report.publicId}** and sent to staff.`
        : `Crash report saved as **${result.report.publicId}**. Staff channel posting is not configured yet.`,
      embeds: [result.embed],
      components: [reportReceiptButtons('crash', result.report.publicId)],
      allowedMentions: { repliedUser: false }
    });
  } catch (error) {
    await message.reply({
      content: error instanceof Error
        ? `I could not process that crash report: ${error.message}`
        : 'I could not process that crash report because of an unknown error.',
      allowedMentions: { repliedUser: false }
    });
  }

  return true;
}
