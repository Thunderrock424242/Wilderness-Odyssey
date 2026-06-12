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

type HelpTopic = 'install' | 'crash' | 'bug' | 'suggestions' | 'performance' | 'spark' | 'knownissues' | 'playtesting' | 'privacy';

export function helpPayload() {
  const embed = baseEmbed(
    'Wilderness Oddesy Help',
    'Select a support topic below.'
  )
    .addFields(
      { name: 'Install help', value: 'Setup, Java, RAM, launcher, and clean profile checks.', inline: true },
      { name: 'Crash help', value: 'Use the Support Hub crash button for private log upload.', inline: true },
      { name: 'Bug report', value: 'Use the Support Hub for reproducible gameplay/content issues.', inline: true },
      { name: 'Suggestions', value: 'Use the Support Hub to submit ideas and vote in the suggestions forum.', inline: true },
      { name: 'Performance help', value: 'Use `/performance` or optional `/perfreport` for lag/FPS reports.', inline: true },
      { name: 'Spark reports', value: 'Use `/playtest start` and `/sparkreport` to archive profiler links.', inline: true },
      { name: 'Known issues', value: 'Use `/knownissues` for staff-maintained instability notes.', inline: true },
      { name: 'Playtesting', value: 'Use `/playtest` for the singleplayer stability checklist.', inline: true },
      { name: 'Privacy', value: 'Use `/privacy` to see exactly what reports collect and avoid.', inline: true }
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
    new ButtonBuilder().setCustomId('help:privacy').setLabel('Privacy').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('help:playtesting').setLabel('Playtesting').setStyle(ButtonStyle.Secondary),
    new ButtonBuilder().setCustomId('help:status').setLabel('Status').setStyle(ButtonStyle.Primary)
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
      content: 'Use `/status` for the current support/status page.',
      ephemeral: true
    });
    return true;
  }

  const embed = topic === 'privacy' ? privacyEmbed() : helpTopicEmbed(topic);
  await interaction.reply({
    embeds: [embed],
    ephemeral: true
  });

  return true;
}

function helpTopicEmbed(topic: HelpTopic): EmbedBuilder {
  switch (topic) {
    case 'install':
      return baseEmbed('Install Help', 'Clean installs solve many wilderness disturbances.')
        .addFields(
          { name: 'Checklist', value: 'Use the recommended Java version from `/status`, allocate the recommended RAM, install the exact pack version, and avoid extra mods during troubleshooting.' },
          { name: 'Still stuck?', value: 'Tell staff your launcher, modpack version, Java version, and the exact error text.' }
        );
    case 'crash':
      return baseEmbed('Crash Help', 'Use the Support Hub button **Crash** for private log upload.')
        .addFields(
          { name: 'Accepted files', value: 'Upload `.txt` or `.log` files. Large files are rejected before parsing.' },
          { name: 'Slash fallback', value: 'Power users can still use `/crash file:<crash-report-or-latest.log>`.' },
          { name: 'Analysis', value: 'The bot checks common signatures like Java mismatch, duplicate mods, out-of-memory, worldgen, mixins, renderer issues, and Wilderness Oddesy API/content crashes.' }
        );
    case 'bug':
      return baseEmbed('Bug Report Help', 'Use **Bug** in the Support Hub when the game runs but something behaves incorrectly.')
        .addFields(
          { name: 'Best reports include', value: 'Pack version, Minecraft version, NeoForge/Forge version, singleplayer/multiplayer, what happened, expected behavior, reproduction steps, dimension/location, repeatability, nearby special content, optional screenshots, optional redacted logs, and optional Spark links.' },
          { name: 'Crash logs', value: 'Use **Crash** for dedicated crash analysis. `/bugreport` also accepts optional latest.log/crash logs and redacts them before storage.' }
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
  }
}
