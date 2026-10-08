import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../types';
import { connected, privateAction } from './common';
import { ServiceError } from '../../connected/store';

export const dashboardCommand: SlashCommand = {
  // No Administrator visibility restriction: demoted members must retain self-revocation.
  data: new SlashCommandBuilder().setName('dashboard').setDescription('Manage your website dashboard access').setDMPermission(false)
    .addSubcommand(command => command.setName('enable').setDescription('Enable your own administrator sign-in'))
    .addSubcommand(command => command.setName('disable').setDescription('Disable your access and revoke all your dashboard sessions')),
  async execute(interaction) {
    await privateAction(interaction, async () => {
      const auth = connected().dashboard;
      if (!auth) throw new ServiceError(503, 'UNAVAILABLE', 'Website dashboard sign-in has not been configured.');
      const command = interaction.options.getSubcommand();
      if (!['enable', 'disable'].includes(command)) throw new ServiceError(403, 'FORBIDDEN', 'Choose enable or disable.');
      await auth.enroll(interaction.user.id, interaction.guildId, command === 'enable');
      return command === 'enable'
        ? 'Your dashboard access is enabled. Sign in with Discord: ' + new URL('/login/', auth.options.redirectUri).href
        : 'Your dashboard access is disabled. All your dashboard sessions have been revoked.';
    });
  },
};
