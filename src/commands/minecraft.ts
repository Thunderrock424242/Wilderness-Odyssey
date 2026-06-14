import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { config } from '../config';
import {
  createMinecraftLinkCode,
  getMinecraftLinkByUserId,
  removeMinecraftLink
} from '../services/minecraftVerificationService';
import { baseEmbed } from '../utils/embeds';

export const minecraftCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('minecraft')
    .setDescription('Verify or manage your linked Minecraft account.')
    .addSubcommand((subcommand) =>
      subcommand
        .setName('link')
        .setDescription('Generate a one-time code to link your Minecraft account.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('status')
        .setDescription('Show your linked Minecraft account.')
    )
    .addSubcommand((subcommand) =>
      subcommand
        .setName('unlink')
        .setDescription('Remove your linked Minecraft account.')
    ),
  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand(true);

    if (subcommand === 'link') {
      const code = createMinecraftLinkCode({
        userId: interaction.user.id,
        username: interaction.user.tag
      });

      await interaction.reply({
        embeds: [
          baseEmbed('Minecraft Verification', minecraftVerificationIntro())
            .addFields(
              { name: 'Code', value: `\`${code.code}\``, inline: true },
              { name: 'Expires', value: `${config.minecraftVerification.codeTtlMinutes} minutes`, inline: true },
              { name: 'In Minecraft', value: minecraftLinkCommandText(code.code) },
              { name: 'Verification setup', value: verificationSetupText() }
            )
        ],
        flags: 'Ephemeral'
      });
      return;
    }

    if (subcommand === 'status') {
      const link = getMinecraftLinkByUserId(interaction.user.id);
      await interaction.reply({
        content: link
          ? `You are linked to **${link.minecraftName}** (\`${link.minecraftUuid}\`).`
          : 'You do not have a Minecraft account linked yet. Use `/minecraft link` and I will give you a one-time code.',
        flags: 'Ephemeral'
      });
      return;
    }

    const removed = removeMinecraftLink(interaction.user.id);
    await interaction.reply({
      content: removed
        ? 'All set. Your Minecraft account link was removed.'
        : 'I could not find a Minecraft account link for you yet.',
      flags: 'Ephemeral'
    });
  }
};

function minecraftVerificationIntro(): string {
  return config.minecraftVerification.relayChannelId
    ? 'Here is your one-time code for the official playtest Minecraft server.'
    : 'Here is your one-time code for the playtest client.';
}

function minecraftLinkCommandText(code: string): string {
  return config.minecraftVerification.relayChannelId
    ? `Join the playtest server and run \`/wo link ${code}\` there.`
    : `Run \`/wo link ${code}\` in the playtest client.`;
}

function verificationSetupText(): string {
  if (config.minecraftVerification.relayChannelId) {
    return 'Server relay is configured. Players do not need a bot API URL in their client config.';
  }

  if (config.minecraftVerification.publicBaseUrl) {
    return `Set \`verification.apiBaseUrl\` to \`${config.minecraftVerification.publicBaseUrl.replace(/\/$/, '')}\`.`;
  }

  return config.minecraftVerification.apiEnabled
    ? `API is enabled on port ${config.minecraftVerification.apiPort}; set \`MINECRAFT_VERIFY_PUBLIC_URL\` so the client config can use the public base URL.`
    : 'API is disabled. Set `MINECRAFT_VERIFY_API_ENABLED=true` on the bot host before using in-game linking.';
}
