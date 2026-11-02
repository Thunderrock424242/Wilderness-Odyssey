import { PermissionFlagsBits, SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../../types';
import { connected, privateAction } from './common';
import { requireDiscordAdministrator } from '../../connected/discordPermissions';
import { ServiceError } from '../../connected/store';

export const playtesterCommand: SlashCommand = {
  data: new SlashCommandBuilder().setName('playtester').setDescription('Invite a Discord account to the website playtester home').setDMPermission(false).setDefaultMemberPermissions(PermissionFlagsBits.Administrator)
    .addSubcommand(command => command.setName('create').setDescription('Create a playtest campaign with diagnostic collection off')
      .addStringOption(option => option.setName('campaign').setDescription('Unique campaign ID: letters, numbers, underscores or hyphens').setRequired(true).setMaxLength(96))
      .addStringOption(option => option.setName('title').setDescription('Playtest title').setRequired(true).setMaxLength(100)))
    .addSubcommand(command => command.setName('invite').setDescription('Send an account-bound playtester invitation by DM')
      .addUserOption(option => option.setName('account').setDescription('Discord account to invite').setRequired(true))
      .addStringOption(option => option.setName('campaign').setDescription('Existing playtest campaign ID').setRequired(true).setMaxLength(100)))
    .addSubcommand(command => command.setName('revoke').setDescription('Revoke an account’s website access to a playtest')
      .addUserOption(option => option.setName('account').setDescription('Discord account').setRequired(true))
      .addStringOption(option => option.setName('campaign').setDescription('Playtest campaign ID').setRequired(true).setMaxLength(100))),
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
      const account = interaction.options.getUser('account', true), campaign = interaction.options.getString('campaign', true);
      if (account.bot) throw new ServiceError(400, 'INVALID_INPUT', 'Select a human Discord account.');
      if (interaction.options.getSubcommand() === 'revoke') {
        runtime.participant.revoke(account.id, campaign);
        return 'Website playtester access revoked for that account and campaign. Game installation access is managed separately.';
      }
      const result = await runtime.inviteParticipant(account.id, campaign, interaction.id, 24, () => requireDiscordAdministrator(interaction.client.rest, interaction.guildId!, interaction.user.id));
      return result.delivery === 'sent' ? 'Invitation sent by DM. It expires in 24 hours and only the selected account can claim it.'
        : 'DM delivery could not be confirmed. Privately share this account-bound claim link with the selected person: ' + result.claimUrl;
    });
  },
};
