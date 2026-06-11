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
          baseEmbed('Minecraft Verification', 'Use this one-time code in your playtest client.')
            .addFields(
              { name: 'Code', value: `\`${code.code}\``, inline: true },
              { name: 'Expires', value: `${config.minecraftVerification.codeTtlMinutes} minutes`, inline: true },
              { name: 'In Minecraft', value: `Run \`/wo link ${code.code}\`.` },
              { name: 'Client config', value: verificationClientConfigText() }
            )
        ],
        ephemeral: true
      });
      return;
    }

    if (subcommand === 'status') {
      const link = getMinecraftLinkByUserId(interaction.user.id);
      await interaction.reply({
        content: link
          ? `Linked to **${link.minecraftName}** (\`${link.minecraftUuid}\`).`
          : 'No Minecraft account is linked yet. Use `/minecraft link` to generate a code.',
        ephemeral: true
      });
      return;
    }

    const removed = removeMinecraftLink(interaction.user.id);
    await interaction.reply({
      content: removed ? 'Your Minecraft account link was removed.' : 'No Minecraft account link was found.',
      ephemeral: true
    });
  }
};

function verificationClientConfigText(): string {
  if (config.minecraftVerification.publicBaseUrl) {
    return `Set \`verification.apiBaseUrl\` to \`${config.minecraftVerification.publicBaseUrl.replace(/\/$/, '')}\`.`;
  }

  return config.minecraftVerification.apiEnabled
    ? `API is enabled on port ${config.minecraftVerification.apiPort}; set \`MINECRAFT_VERIFY_PUBLIC_URL\` so the client config can use the public base URL.`
    : 'API is disabled. Set `MINECRAFT_VERIFY_API_ENABLED=true` on the bot host before using in-game linking.';
}
