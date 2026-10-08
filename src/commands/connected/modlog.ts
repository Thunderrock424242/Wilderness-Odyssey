import { escapeMarkdown, SlashCommandBuilder } from 'discord.js';
import { z } from 'zod';
import type { SlashCommand } from '../../types';
import { playerDetailSchema, reportDetailSchema, restrictionSchema } from '../../contracts/v1/admin';
import { connected, privateAction, staff } from './common';
export const modlogCommand: SlashCommand = {
  data: new SlashCommandBuilder().setName('modlog').setDescription('Review private moderation records.')
    .addSubcommand(s => s.setName('player').setDescription('Review an official-server player.').addStringOption(o => o.setName('uuid').setDescription('Verified Minecraft UUID.').setRequired(true)))
    .addSubcommand(s => s.setName('account').setDescription('Review restrictions across all Aether access.').addStringOption(o => o.setName('id').setDescription('Verified Aether account UUID.').setRequired(true)))
    .addSubcommand(s => s.setName('report').setDescription('Review a selected private report.').addStringOption(o => o.setName('id').setDescription('Report UUID.').setRequired(true))),
  async execute(interaction) {
    await privateAction(interaction, async () => {
      const runtime = connected(), kind = interaction.options.getSubcommand();
      const actor = await staff(runtime, interaction, kind === 'report' ? 'reports:read' : 'players:read');
      const id = z.uuid().parse(interaction.options.getString(kind === 'player' ? 'uuid' : 'id', true));
      if (kind === 'player') {
        const detail = playerDetailSchema.parse(await runtime.admin.handle(actor, 'GET', '/players/' + id, undefined));
        return detail.player.username + ' (' + id + ')\nOfficial-server restrictions: ' + detail.restrictions.length + '\n' + detail.history.slice(0, 5).map(row => escapeMarkdown(row.action + ': ' + row.reason.slice(0, 180))).join('\n');
      }
      if (kind === 'report') {
        const detail = reportDetailSchema.parse(await runtime.admin.handle(actor, 'GET', '/reports/' + id, undefined));
        return 'Report ' + id + ' · ' + detail.report.state + '\n' + escapeMarkdown(detail.report.summary) + '\n' + detail.excerpts.slice(0, 2).map(row => escapeMarkdown(row.speaker + ': ' + row.text.slice(0, 350))).join('\n') + '\nProvenance: ' + escapeMarkdown(detail.provenance) + '\nExcerpt retention ends: ' + detail.retentionUntil;
      }
      const schema = z.object({ account: z.object({ id: z.uuid(), restrictions: z.array(restrictionSchema) }) });
      const detail = schema.parse(await runtime.admin.handle(actor, 'GET', '/accounts/' + id, undefined));
      return 'Aether account ' + detail.account.id + '\nAcross all access methods:\n' + (detail.account.restrictions.slice(0, 5).map(row => (row.revokedAt ? 'Revoked' : row.expiresAt && Date.parse(row.expiresAt) <= Date.now() ? 'Expired' : 'Active') + ': ' + escapeMarkdown(row.reason.slice(0, 200))).join('\n') || 'No global restrictions.');
    });
  },
};
