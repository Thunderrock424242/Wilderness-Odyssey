import { PermissionsBitField, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { isSetupSection, runSetupDoctor } from '../services/setupDoctorService';
import { requireStaff } from '../utils/permissions';

export const setupCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('setup')
    .setDescription('Staff: check bot setup and see how to fix missing settings or permissions.')
    .setDMPermission(false)
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
    .addStringOption(option => option
      .setName('section')
      .setDescription('Check everything or focus on one area.')
      .addChoices(
        { name: 'Full setup', value: 'full' },
        { name: 'Channels and forum tags', value: 'channels' },
        { name: 'Permissions in this channel', value: 'permissions' },
        { name: 'Q&A routing', value: 'qa' },
        { name: 'Playtests and verification', value: 'playtest' },
      )),
  async execute(interaction) {
    if (!(await requireStaff(interaction))) { return; }
    const section = interaction.options.getString('section') ?? 'full';
    await runSetupDoctor(interaction, isSetupSection(section) ? section : 'full');
  },
};
