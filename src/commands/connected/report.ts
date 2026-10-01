import { ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType, escapeMarkdown, SlashCommandBuilder } from 'discord.js';
import { z } from 'zod';
import type { SlashCommand } from '../../types';
import { beginBugReportIntakeFromCommand } from '../../services/reportIntakeService';
import { redactReportText, verifiedReportPlayer } from '../../services/connectedReportService';
import { baseEmbed } from '../../utils/embeds';
import { connected, noMentions, privateAction } from './common';
import { ServiceError } from '../../connected/store';
const pending = new Set<string>();
export const reportCommand: SlashCommand = {
  data: new SlashCommandBuilder().setName('report').setDescription('Submit a bug, selected AI conversation, or appeal.')
    .addSubcommand(s => s.setName('bug').setDescription('Start the existing guided bug-report intake.'))
    .addSubcommand(s => s.setName('aether').setDescription('Preview and privately submit selected AI evidence.')
      .addStringOption(o => o.setName('summary').setDescription('Describe the concern.').setMinLength(10).setMaxLength(500).setRequired(true))
      .addStringOption(o => o.setName('excerpt').setDescription('Only the relevant selected message.').setMinLength(1).setMaxLength(2000).setRequired(true))
      .addStringOption(o => o.setName('speaker').setDescription('Who wrote the selected message?').addChoices({ name: 'Player', value: 'player' }, { name: 'Aether', value: 'aether' }).setRequired(true))
      .addStringOption(o => o.setName('sent_at').setDescription('Message time in ISO format.').setMaxLength(40).setRequired(true))
      .addStringOption(o => o.setName('minecraft_uuid').setDescription('Choose a linked account if you have more than one.').setMaxLength(36)))
    .addSubcommand(s => s.setName('appeal').setDescription('Ask another staff member to review a moderation decision.')
      .addStringOption(o => o.setName('message').setDescription('Explain your appeal.').setMinLength(10).setMaxLength(1000).setRequired(true))
      .addStringOption(o => o.setName('minecraft_uuid').setDescription('Choose a linked account if you have more than one.').setMaxLength(36))),
  async execute(interaction) {
    if (interaction.options.getSubcommand() === 'bug') { await beginBugReportIntakeFromCommand(interaction); return; }
    await privateAction(interaction, async () => {
      if (pending.has(interaction.user.id) || pending.size >= 100) throw new ServiceError(429, 'BUSY', 'Finish the pending report, or try again shortly.');
      pending.add(interaction.user.id);
      try {
        const runtime = connected(), uuid = interaction.options.getString('minecraft_uuid');
        const owner = verifiedReportPlayer(runtime, interaction.user.id, uuid);
        const appeal = interaction.options.getSubcommand() === 'appeal';
        const summary = redactReportText(interaction.options.getString(appeal ? 'message' : 'summary', true));
        const selected = appeal ? [] : [{
          speaker: z.enum(['player', 'aether']).parse(interaction.options.getString('speaker', true)),
          text: redactReportText(interaction.options.getString('excerpt', true)),
          sentAt: z.iso.datetime({ offset: true }).parse(interaction.options.getString('sent_at', true)),
        }];
        const prefix = 'connected-report:' + interaction.id;
        const row = new ActionRowBuilder<ButtonBuilder>().addComponents(
          new ButtonBuilder().setCustomId(prefix + ':submit').setLabel('Submit privately').setStyle(ButtonStyle.Primary),
          new ButtonBuilder().setCustomId(prefix + ':cancel').setLabel('Cancel').setStyle(ButtonStyle.Secondary),
        );
        const preview = baseEmbed(appeal ? 'Review your appeal' : 'Review selected AI evidence', escapeMarkdown(summary))
          .addFields({ name: 'Verified player', value: owner.player.username + '\n' + owner.playerUuid },
            { name: 'Privacy and provenance', value: 'Only the previewed text is submitted. This is user-supplied evidence, not a server transcript. Redaction is imperfect: cancel if private details remain. Excerpts expire after 30 days; moderation metadata after 180 days.' });
        const embeds = selected[0] ? [preview, baseEmbed(selected[0].speaker + ' · ' + selected[0].sentAt, escapeMarkdown(selected[0].text))] : [preview];
        const message = await interaction.editReply({ embeds, components: [row], allowedMentions: noMentions });
        let submit = false;
        try {
          const choice = await message.awaitMessageComponent({ componentType: ComponentType.Button, time: 60000,
            filter: item => item.user.id === interaction.user.id && [prefix + ':submit', prefix + ':cancel'].includes(item.customId) });
          await choice.deferUpdate();
          submit = choice.customId === prefix + ':submit';
        } catch { /* Expiry cancels collection without persisting any selected content. */ }
        await interaction.editReply({ embeds: [], components: [], allowedMentions: noMentions });
        if (!submit) return 'Nothing was submitted. Start another report when you are ready.';
        const current = verifiedReportPlayer(runtime, interaction.user.id, owner.playerUuid);
        if (current.accountId !== runtime.identity.canonical(owner.accountId)) throw new ServiceError(403, 'IDENTITY_CHANGED', 'Your linked account changed. Start a new report.');
        if (appeal) {
          runtime.moderation.appeal(current.accountId, current.playerUuid, summary, interaction.id);
          return 'Your appeal was recorded for staff review.';
        }
        const report = runtime.moderation.submitReport({ accountId: current.accountId, playerUuid: current.playerUuid, summary, excerpts: selected, provenance: 'Selected and confirmed by the authenticated Discord user; message time and speaker are user supplied.' }, interaction.id);
        return 'Your private report was submitted. Reference: ' + report.id;
      } finally { pending.delete(interaction.user.id); }
    });
  },
};
