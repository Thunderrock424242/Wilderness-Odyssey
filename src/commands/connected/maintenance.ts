import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../types';
import { mutationSchema } from '../../contracts/v1/admin';
import { connected, privateAction, staff } from './common';
import { ServiceError } from '../../connected/store';
export const maintenanceCommand: SlashCommand = {
  data: new SlashCommandBuilder().setName('maintenance').setDescription('Manage official service maintenance.')
    .addSubcommand(sub => sub.setName('show').setDescription('Show maintenance and its current revision.'))
    .addSubcommand(sub => sub.setName('set').setDescription('Update maintenance using its current revision.')
      .addBooleanOption(o => o.setName('active').setDescription('Enable maintenance.').setRequired(true))
      .addStringOption(o => o.setName('reason').setDescription('Private audit reason.').setMinLength(10).setMaxLength(1000).setRequired(true))
      .addStringOption(o => o.setName('revision').setDescription('Revision from maintenance show.').setRequired(true).setMaxLength(120))
      .addStringOption(o => o.setName('services').setDescription('Affected services.').addChoices({ name: 'Both', value: 'both' }, { name: 'Minecraft', value: 'minecraft' }, { name: 'Aether', value: 'aether' }))
      .addStringOption(o => o.setName('message').setDescription('Public maintenance message.').setMaxLength(1000))
      .addStringOption(o => o.setName('ends_at').setDescription('End time in ISO format, within seven days.').setMaxLength(40))),
  async execute(interaction) {
    await privateAction(interaction, async () => {
      const runtime = connected(), actor = staff(runtime, interaction, 'server:write');
      const current = runtime.monitor.maintenance();
      if (interaction.options.getSubcommand() === 'show') return 'Maintenance: ' + (current.active ? 'Active' : 'Inactive') + '\nRevision: ' + current.revision + '\n' + current.message.slice(0, 500);
      const active = interaction.options.getBoolean('active', true);
      const rawEnd = interaction.options.getString('ends_at');
      const end = rawEnd ? Date.parse(rawEnd) : NaN;
      if (active && (!Number.isFinite(end) || end <= Date.now() || end > Date.now() + 7 * 86400000)) throw new ServiceError(400, 'INVALID_INPUT', 'Active maintenance needs an end time within the next seven days.');
      const selected = interaction.options.getString('services');
      const services = selected === 'both' ? ['minecraft', 'aether'] : selected ? [selected] : current.services;
      const body = { active, services, message: interaction.options.getString('message') ?? current.message, startsAt: null, endsAt: active ? new Date(end).toISOString() : null, reason: interaction.options.getString('reason', true), revision: interaction.options.getString('revision', true) };
      const result = mutationSchema.parse(await runtime.admin.handle(actor, 'PUT', '/maintenance', body, {}, interaction.id));
      return 'Maintenance change ' + result.operation.state + '. Reference: ' + result.operation.id;
    });
  },
};
