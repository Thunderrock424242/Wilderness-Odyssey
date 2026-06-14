import { SlashCommandBuilder } from 'discord.js';
import type { SlashCommand } from '../types';
import { baseEmbed } from '../utils/embeds';

type InstallTopic = 'curseforge' | 'modrinth' | 'prism' | 'java_ram' | 'clean_profile' | 'server_mismatch';

export const installHelpCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('installhelp')
    .setDescription('Get launcher, Java, RAM, and clean-profile troubleshooting help.')
    .addStringOption((option) =>
      option
        .setName('topic')
        .setDescription('What install problem should I help with?')
        .setRequired(false)
        .addChoices(
          { name: 'CurseForge ZIP/import', value: 'curseforge' },
          { name: 'Modrinth import', value: 'modrinth' },
          { name: 'Prism Launcher import', value: 'prism' },
          { name: 'Java and RAM', value: 'java_ram' },
          { name: 'Clean profile repair', value: 'clean_profile' },
          { name: 'Server/client mismatch', value: 'server_mismatch' }
        )
    ),
  async execute(interaction) {
    const topic = (interaction.options.getString('topic') ?? 'curseforge') as InstallTopic;
    await interaction.reply({
      embeds: [installHelpEmbed(topic)],
      flags: 'Ephemeral'
    });
  }
};

function installHelpEmbed(topic: InstallTopic) {
  switch (topic) {
    case 'modrinth':
      return baseEmbed('Modrinth Import Help', 'Use the exact Wilderness Odyssey pack file staff published.')
        .addFields(
          { name: 'Import steps', value: 'Open Modrinth App, choose Create Profile, use Import from file if available, select the published pack file, and let the launcher install the listed mod versions.' },
          { name: 'Common fixes', value: 'Do not unzip the pack first. Do not mix files from an older profile. If launch fails, create a fresh profile and import again.' },
          { name: 'Need staff?', value: 'Share launcher name, pack version, Java version, and the exact error text. Use `/crash` if a crash report or latest.log exists.' }
        );
    case 'prism':
      return baseEmbed('Prism Launcher Import Help', 'Prism is powerful, but version drift is easy.')
        .addFields(
          { name: 'Import steps', value: 'Create or import an instance from the published pack file. Confirm Minecraft, loader, and mod list match the release notes before launching.' },
          { name: 'Java/RAM', value: 'Set Java and memory per `/status`. Avoid using system Java if it is older than the recommended version.' },
          { name: 'Clean test', value: 'Disable extra mods, resource packs, and shader packs while reproducing support issues.' }
        );
    case 'java_ram':
      return baseEmbed('Java and RAM Help', 'Most launch failures are version or memory problems.')
        .addFields(
          { name: 'Java', value: 'Check `/status` for the recommended Java version. After changing Java in your launcher, fully close and reopen the launcher before testing again.' },
          { name: 'RAM', value: 'Use the recommended RAM range from `/status`. Do not allocate all system memory; leave room for Windows, Discord, and the launcher.' },
          { name: 'Symptoms', value: 'Wrong Java often shows UnsupportedClassVersionError. Too little memory often shows OutOfMemoryError or Java heap space.' }
        );
    case 'clean_profile':
      return baseEmbed('Clean Profile Repair', 'Use this when files may be mixed, duplicated, or manually edited.')
        .addFields(
          { name: 'Steps', value: 'Create a fresh profile from the current pack file, launch once without extra mods/shaders/resource packs, then add personal extras back only after the pack works.' },
          { name: 'Avoid', value: 'Do not copy a whole mods folder from an old version into a new version. Duplicate or wrong-version jars are a common crash cause.' },
          { name: 'Still broken?', value: 'Use `/crash` with latest.log or the crash report so the bot can check common signatures.' }
        );
    case 'server_mismatch':
      return baseEmbed('Server/Client Mismatch', 'Use this when multiplayer fails but singleplayer may work.')
        .addFields(
          { name: 'Checks', value: 'Confirm the server and client are on the same Wilderness Odyssey version, same Minecraft version, and same loader version.' },
          { name: 'Extra mods', value: 'Client-only visual mods usually do not belong on the server. Server-only helper mods usually do not belong on the client.' },
          { name: 'Report details', value: 'Tell staff the server name, pack version, exact disconnect text, and whether singleplayer launches.' }
        );
    case 'curseforge':
      return baseEmbed('CurseForge ZIP Import Help', 'Use the published ZIP exactly as staff sent it.')
        .addFields(
          { name: 'Import steps', value: 'Download the ZIP, do not unzip it, open CurseForge, choose Minecraft, create a custom profile, then use the import option for an existing ZIP/profile.' },
          { name: 'Common fixes', value: 'If import fails, redownload the ZIP, make sure it is not partially downloaded, and try importing into a brand-new profile.' },
          { name: 'Playtest note', value: 'For gated playtests, accept the playtest terms/privacy gate first. The bot sends the ZIP link privately after acceptance.' }
        );
  }
}
