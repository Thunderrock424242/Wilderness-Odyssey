import { escapeMarkdown, SlashCommandSubcommandGroupBuilder, type ChatInputCommandInteraction } from 'discord.js';
import { z } from 'zod';
import { connected, privateAction } from './common';
export const tokenGroup = new SlashCommandSubcommandGroupBuilder().setName('token').setDescription('Manage your Aether API credentials.')
  .addSubcommand(s => s.setName('issue').setDescription('Learn how to create a token on the protected website.'))
  .addSubcommand(s => s.setName('list').setDescription('List your token metadata without displaying credentials.'))
  .addSubcommand(s => s.setName('revoke').setDescription('Revoke one of your tokens.').addStringOption(o => o.setName('id').setDescription('Token ID from the list.').setRequired(true).setMaxLength(36)));
export async function executeToken(interaction: ChatInputCommandInteraction): Promise<void> {
  await privateAction(interaction, () => {
    if (interaction.options.getSubcommand() === 'issue') return 'Sign in to the Wilderness Odyssey website and open Account (/account/) to create an API token. Tokens are shown once there. Never paste a token into Discord. Minecraft linking is optional for standalone use.';
    const runtime = connected(false), account = runtime.identity.account('discord', interaction.user.id);
    if (interaction.options.getSubcommand() === 'revoke') {
      runtime.identity.revoke(account, z.uuid().parse(interaction.options.getString('id', true)));
      return 'The token was revoked.';
    }
    return 'Aether account: ' + account + '\n' + (runtime.identity.tokens(account).slice(0, 10).map(token =>
      escapeMarkdown(token.label.slice(0, 40)) + ' · ' + (token.revokedAt ? 'Revoked' : Date.parse(token.expiresAt) <= Date.now() ? 'Expired' : 'Active') + '\nID: ' + token.id + '\nExpires: ' + token.expiresAt).join('\n') || 'No tokens. Website tokens appear here after your accounts are securely linked.');
  });
}
