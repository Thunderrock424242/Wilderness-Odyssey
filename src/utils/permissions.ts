import {
  ButtonInteraction,
  ChatInputCommandInteraction,
  ModalSubmitInteraction,
  PermissionsBitField,
  StringSelectMenuInteraction
} from 'discord.js';

type StaffInteraction =
  | ChatInputCommandInteraction
  | ButtonInteraction
  | ModalSubmitInteraction
  | StringSelectMenuInteraction;

export function isStaff(interaction: StaffInteraction): boolean {
  const permissions = interaction.memberPermissions;
  if (!permissions) {
    return false;
  }

  return permissions.has(PermissionsBitField.Flags.Administrator)
    || permissions.has(PermissionsBitField.Flags.ManageGuild)
    || permissions.has(PermissionsBitField.Flags.ModerateMembers);
}

export async function requireStaff(interaction: StaffInteraction): Promise<boolean> {
  if (isStaff(interaction)) {
    return true;
  }

  await interaction.reply({
    content: 'This control is staff-only. You need administrator, manage server, or moderator permissions to use it.',
    flags: 'Ephemeral'
  });

  return false;
}
