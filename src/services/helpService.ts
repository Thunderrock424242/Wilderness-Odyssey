import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  EmbedBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuInteraction
} from 'discord.js';
import { baseEmbed, privacyEmbed } from '../utils/embeds';
import { supportStatusEmbed } from '../commands/status';

type HelpTopic = 'install' | 'crash' | 'bug' | 'suggestions' | 'performance' | 'spark' | 'knownissues' | 'playtesting' | 'privacy';

export function helpPayload() {
  const embed = baseEmbed(
    'Wilderness Odyssey · Help',
    'Choose a topic or use a button below. Reports start privately so you can review your details before posting.'
  )
    .addFields(
      { name: 'Game will not launch or crashes', value: 'Choose **Crash help**. Have your crash report or latest.log ready.', inline: true },
      { name: 'Something in the game is broken', value: 'Choose **Report bug**. Describe what happened and how to repeat it.', inline: true },
      { name: 'Need a person to help', value: 'Choose **Ask staff** for a private support ticket.', inline: true },
      { name: 'Install, lag, ideas, or playtests', value: 'Choose a topic from the menu. `/knownissues` lists current fixes and workarounds.', inline: true },
      { name: 'Server availability', value: 'Choose **Server status** for recent observations and recommended pack settings.', inline: true },
      { name: 'Before sharing logs', value: 'Remove personal details and secrets. Redaction is best-effort. Final reports may be public.', inline: true }
    );

  const menu = new StringSelectMenuBuilder()
    .setCustomId('help:topic')
    .setPlaceholder('Choose a support topic')
    .addOptions(
      { label: 'Install help', value: 'install', description: 'Java, RAM, launcher, and clean install checks.' },
      { label: 'Crash help', value: 'crash', description: 'How to submit crash reports and logs.' },
      { label: 'Bug report', value: 'bug', description: 'What makes a useful bug report.' },
      { label: 'Suggestions', value: 'suggestions', description: 'Submit and vote on modpack ideas.' },
      { label: 'Performance help', value: 'performance', description: 'FPS, RAM, shaders, and lag details.' },
      { label: 'Spark reports', value: 'spark', description: 'Playtest profiling links and Spark commands.' },
      { label: 'Known issues', value: 'knownissues', description: 'Current staff-tracked issues.' },
      { label: 'Playtesting', value: 'playtesting', description: 'Singleplayer stability checklist.' },
      { label: 'Privacy', value: 'privacy', description: 'What the bot collects and does not collect.' }
    );

  const buttons = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder().setCustomId('supportpanel:category:bug').setLabel('Report bug').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('supportpanel:category:crash').setLabel('Crash help').setStyle(ButtonStyle.Primary),
    new ButtonBuilder().setCustomId('supportpanel:category:other').setLabel('Ask staff').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('help:privacy').setLabel('Privacy').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('help:status').setLabel('Server status').setStyle(ButtonStyle.Secondary)
  );

  return {
    embeds: [embed],
    components: [
      new ActionRowBuilder<StringSelectMenuBuilder>().addComponents(menu),
      buttons
    ]
  };
}

export async function handleHelpComponent(interaction: StringSelectMenuInteraction | ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('help:')) {
    return false;
  }

  const topic = interaction.isStringSelectMenu()
    ? interaction.values[0] as HelpTopic
    : interaction.customId.split(':')[1] as HelpTopic | 'status';

  if (topic === 'status') {
    await interaction.reply({
      embeds: [supportStatusEmbed()],
      flags: 'Ephemeral',
      allowedMentions: { parse: [] },
    });
    return true;
  }

  const embed = topic === 'privacy' ? privacyEmbed() : helpTopicEmbed(topic);
  await interaction.reply({
    embeds: [embed],
    flags: 'Ephemeral'
  });

  return true;
}

function helpTopicEmbed(topic: HelpTopic): EmbedBuilder {
  switch (topic) {
    case 'install':
      return baseEmbed('Install help', 'Start with the recommended pack, Java version, and RAM settings.')
        .addFields(
          { name: 'Checklist', value: 'Use the recommended Java version from `/status`, allocate the recommended RAM, install the exact pack version, and avoid extra mods during troubleshooting.' },
          { name: 'Guided topics', value: 'Use `/installhelp` for CurseForge ZIP import, Modrinth, Prism Launcher, Java/RAM, clean profile repair, or server/client mismatch help.' },
          { name: 'Still stuck?', value: 'Tell staff your launcher, modpack version, Java version, and the exact error text.' }
        );
    case 'crash':
      return baseEmbed('Crash Help', 'Use the Support Hub button **Crash** for private guided log intake.')
        .addFields(
          { name: 'Accepted files', value: 'Upload `.txt` or `.log` files. Large files are rejected before parsing.' },
          { name: 'Slash shortcut', value: '`/crash file:<crash-report-or-latest.log>` preloads the log, then opens the same private review flow.' },
          { name: 'Analysis', value: 'The bot checks common signatures like Java mismatch, duplicate mods, out-of-memory, worldgen, mixins, renderer issues, and Wilderness Odyssey API/content crashes.' }
        );
    case 'bug':
      return baseEmbed('Bug Report Help', 'Use **Bug** in the Support Hub when the game runs but something behaves incorrectly.')
        .addFields(
          { name: 'Best reports include', value: 'Pack version, Minecraft version, NeoForge/Forge version, singleplayer/multiplayer, what happened, expected behavior, reproduction steps, dimension/location, repeatability, nearby special content, optional screenshots, optional redacted logs, and optional Spark links.' },
          { name: 'Crash logs', value: 'Use **Crash** for dedicated crash analysis. **Bug** can collect optional latest.log/crash logs in the private intake and redacts them before storage.' }
        );
    case 'suggestions':
      return baseEmbed('Suggestions', 'Use `/suggest` to submit modpack ideas.')
        .addFields(
          { name: 'Categories', value: 'New structure, new mob, new item, balance change, lore idea, dimension idea, performance improvement, quality of life, or other.' },
          { name: 'Voting', value: 'Suggestions posted to the suggestions channel include Upvote, Downvote, and Needs discussion buttons.' }
        );
    case 'performance':
      return baseEmbed('Performance Help', 'Performance reports are optional and opt-in.')
        .addFields(
          { name: 'Useful details', value: 'FPS average, RAM allocated/used, CPU/GPU if you want to share it, Java version, pack version, shaders, render distance, and whether lag happens near structures, rifts, anomalies, entities, or dimensions.' }
        );
    case 'spark':
      return baseEmbed('Spark Playtesting', 'The bot organizes Spark links; it does not run Minecraft commands for players.')
        .addFields(
          { name: 'Start a session', value: 'Use `/playtest start`, then run Minecraft and reproduce the lag period.' },
          { name: 'Profiler commands', value: 'For servers, use `/spark profiler start --timeout 120`. On Forge/Fabric clients, Spark may use `/sparkc` instead of `/spark`.' },
          { name: 'Archive the result', value: 'Copy the public Spark viewer link and submit it with `/sparkreport`.' }
        );
    case 'knownissues':
      return baseEmbed('Known Issues', 'Use `/knownissues` to see the staff-maintained list.')
        .addFields({ name: 'Staff tools', value: 'Staff can add, update, and remove known issues with `/staff issue ...`.' });
    case 'playtesting':
      return baseEmbed('Playtesting', 'Use `/playtest` for the singleplayer stability checklist.')
        .addFields({ name: 'Goal', value: 'Try core pack flows for 30 minutes and report bugs, crashes, and performance trouble with the matching commands.' });
    case 'privacy':
      return privacyEmbed();
    default:
      return baseEmbed('Help topic unavailable', 'Use `/help` to open the current menu, or choose Ask staff for a private ticket.');
  }
}
