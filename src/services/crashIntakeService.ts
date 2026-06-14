import {
  ButtonInteraction,
  ChannelType,
  Message,
  PermissionsBitField,
  StringSelectMenuInteraction
} from 'discord.js';
import { LRUCache } from 'lru-cache';
import { baseEmbed } from '../utils/embeds';
import { reportReceiptButtons } from './reportService';
import { archiveCrashAttachment } from './crashReportService';
import {
  ticketChannelName,
  ticketControlRows,
  ticketPermissionOverwrites,
  resolveSupportTicketParentId
} from './supportTicketService';
import { postStaffLog } from './staffLogService';

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
      content: 'I can only create a crash upload channel inside the Discord server.',
      flags: 'Ephemeral'
    });
    return;
  }

  const botMember = interaction.guild.members.me;
  if (!botMember?.permissions.has(PermissionsBitField.Flags.ManageChannels)) {
    await interaction.reply({
      content: 'I need the Manage Channels permission before I can create a private crash upload channel. For now, you can still use `/crash file:`.',
      flags: 'Ephemeral'
    });
    return;
  }

  const parent = await resolveSupportTicketParentId(interaction);
  if (parent.error) {
    await interaction.reply({
      content: `${parent.error} Please fix \`SUPPORT_TICKET_CATEGORY_ID\` or use \`/crash file:\` for now.`,
      flags: 'Ephemeral'
    });
    return;
  }

  const channel = await interaction.guild.channels.create({
    name: ticketChannelName('crash', interaction.user.username),
    type: ChannelType.GuildText,
    parent: parent.parentId,
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
          { name: 'How to upload', value: 'Send the log as a normal message attachment in this channel. Discord modals do not have upload buttons.' },
          { name: 'What happens next', value: 'I copy the file, delete your raw upload here when permissions allow it, redact sensitive values, analyze common crash signatures, and create the public Crash forum post.' },
          { name: 'Crash forum shortcut', value: 'You can also use `/crash file:<log>` in the server to create the Crash forum post directly after redaction.' }
        )
    ],
    components: ticketControlRows()
  });

  await postStaffLog(interaction.client, {
    title: 'Ticket Created',
    description: 'Private crash upload ticket opened.',
    fields: [
      { name: 'Channel', value: `<#${channel.id}> (${channel.id})`, inline: true },
      { name: 'Player', value: `<@${interaction.user.id}> (${interaction.user.tag})`, inline: true }
    ]
  });

  await interaction.reply({
    content: `I created a private crash upload channel for you: <#${channel.id}>. Upload your log there when you are ready.`,
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
      content: 'This crash upload session expired. Please click **Crash** in the Support Hub again when you are ready.',
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
      content: 'Please attach your `latest.log`, crash report, `.log`, or `.txt` file in this channel.',
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
    const resultMessage = {
      content: result.posted
        ? `Thanks, your crash report was created as **${result.report.publicId}** and sent to staff.`
        : `Thanks, your crash report was saved as **${result.report.publicId}**. Staff channel posting is not configured yet, but I kept the report locally.`,
      embeds: [result.embed],
      components: [reportReceiptButtons('crash', result.report.publicId)],
      allowedMentions: { parse: [] }
    } as const;

    if ('send' in message.channel) {
      const rawUploadDeleted = await deleteRawCrashUpload(message);
      await message.channel.send({
        ...resultMessage,
        content: rawUploadDeleted
          ? `${resultMessage.content} I also deleted the raw upload from this channel.`
          : resultMessage.content
      });
      await postStaffLog(message.client, {
        title: 'Crash Report Submitted',
        description: `Legacy crash upload submitted as **${result.report.publicId}**.`,
        fields: [
          { name: 'Report', value: result.report.publicId, inline: true },
          { name: 'Player', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
          { name: 'Forum posted', value: result.posted ? 'Yes' : 'No', inline: true }
        ]
      });
    } else {
      await message.reply({
        ...resultMessage,
        allowedMentions: { repliedUser: false }
      });
    }
  } catch (error) {
    await message.reply({
      content: error instanceof Error
        ? `Sorry, I could not process that crash report yet: ${error.message}`
        : 'Sorry, I could not process that crash report because of an unknown error.',
      allowedMentions: { repliedUser: false }
    });
  }

  return true;
}

async function deleteRawCrashUpload(message: Message): Promise<boolean> {
  if (!message.deletable) {
    return false;
  }

  return message.delete()
    .then(() => true)
    .catch(() => false);
}
