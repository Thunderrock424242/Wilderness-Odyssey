import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../types';
import { connected, privateAction } from './common';
import { requireDiscordAdministrator } from '../../connected/discordPermissions';
import { ServiceError } from '../../connected/store';
import { discordIdSchema } from '../../contracts/v1/auth';

export const playtesterCommand: SlashCommand = {
  data: new SlashCommandBuilder().setName('playtester').setDescription('Invite a Discord account to the website playtester home').setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(command => command.setName('create').setDescription('Create a playtest campaign with diagnostic collection off')
      .addStringOption(option => option.setName('campaign').setDescription('Unique campaign ID: letters, numbers, underscores or hyphens').setRequired(true).setMaxLength(96))
      .addStringOption(option => option.setName('title').setDescription('Playtest title').setRequired(true).setMaxLength(100)))
    .addSubcommand(command => command.setName('invite').setDescription('Send an account-bound playtester invitation by DM')
      .addStringOption(option => option.setName('campaign').setDescription('Existing playtest campaign ID').setRequired(true).setMaxLength(100))
      .addUserOption(option => option.setName('account').setDescription('Discord account to invite'))
      .addStringOption(option => option.setName('account_id').setDescription('Discord account ID, including someone outside this server').setMinLength(17).setMaxLength(22)))
    .addSubcommand(command => command.setName('revoke').setDescription('Revoke an account’s website access to a playtest')
      .addStringOption(option => option.setName('campaign').setDescription('Playtest campaign ID').setRequired(true).setMaxLength(100))
      .addUserOption(option => option.setName('account').setDescription('Discord account'))
      .addStringOption(option => option.setName('account_id').setDescription('Discord account ID, including someone outside this server').setMinLength(17).setMaxLength(22))),
  async execute(interaction) {
    await privateAction(interaction, async () => {
      const runtime = connected();
      if (!runtime.participant || interaction.guildId !== runtime.config.guildId) throw new ServiceError(403, 'FORBIDDEN', 'Use this in the configured Discord server.');
      await requireDiscordAdministrator(interaction.client.rest, interaction.guildId!, interaction.user.id);
      if (interaction.options.getSubcommand() === 'create') {
        const id = interaction.options.getString('campaign',true);
        runtime.participant.createCampaign(id,interaction.options.getString('title',true));
        runtime.store.audit('discord|' + interaction.user.id,'participant.campaign',id,'created');
        return 'Playtest created with collection off. Invite someone with /playtester invite using campaign: ' + id;
      }
      const account = interaction.options.getUser('account'), rawId = interaction.options.getString('account_id');
      if ((!account && !rawId) || (account && rawId)) throw new ServiceError(400, 'INVALID_INPUT', 'Provide either an account or an account ID.');
      const parsed = discordIdSchema.safeParse(account?.id ?? rawId);
      if (!parsed.success) throw new ServiceError(400, 'INVALID_INPUT', 'Provide a valid Discord account ID.');
      const accountId = parsed.data, campaign = interaction.options.getString('campaign', true);
      if (account?.bot) throw new ServiceError(400, 'INVALID_INPUT', 'Select a human Discord account.');
      if (interaction.options.getSubcommand() === 'revoke') {
        runtime.participant.revoke(accountId, campaign);
        return 'Website playtester access revoked for that account and campaign. Game installation access is managed separately.';
      }
      const result = await runtime.inviteParticipant(accountId, campaign, interaction.id, 24, () => requireDiscordAdministrator(interaction.client.rest, interaction.guildId!, interaction.user.id));
      return result.delivery === 'sent' ? 'Invitation sent by DM. It expires in 24 hours and only the selected account can claim it.'
        : 'DM delivery could not be confirmed. Privately share this account-bound claim link with the selected person: ' + result.claimUrl;
    });
  },
};
