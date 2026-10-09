import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  type ButtonInteraction,
  type StringSelectMenuInteraction,
} from 'discord.js';
import { baseEmbed } from '../utils/embeds';

const guideButtonPrefix = 'supportpanel:guide:';

const supportGuidePages = [
  {
    category: 'bug',
    label: 'Report a gameplay bug',
    optionDescription: 'Something is broken in-game, but the game still runs.',
    summary: 'Choose this when a mechanic, item, mob, structure, or other part of the modpack behaves incorrectly.',
    examples: 'An item does nothing when used, a quest cannot be completed, a mob behaves incorrectly, or content is missing.',
    preparation: 'Your modpack version, what happened, what you expected, and steps to repeat the issue. Screenshots and logs are optional. You can skip optional details.',
    nextStep: 'You can check known issues first. Then answer questions in a private channel, review your answers, and confirm before your report is posted for staff review.',
    alternatives: 'If the game closes or will not start, use **Game crashed or will not launch**. If it runs slowly, use **Report lag or low FPS**.',
  },
  {
    category: 'crash',
    label: 'Game crashed or will not launch',
    optionDescription: 'The game closes unexpectedly or fails to start.',
    summary: 'Choose this when Minecraft closes unexpectedly, stops during loading, or cannot start because of a Java or mod loader error.',
    examples: 'The launcher reports an exit code, the game closes when opening a world, or loading ends with an error screen.',
    preparation: 'Your latest.log or crash report as a .txt or .log file, plus what happened just before the crash. A log is required for this report. If you cannot find it, use **Contact staff privately** for help.',
    nextStep: 'You can check known issues first. Upload the log and answer questions in a private channel. Review the report before confirming its forum post. Avoid sharing passwords, tokens, or personal information.',
    alternatives: 'If the game stays open but runs slowly or freezes, use **Report lag or low FPS**. For an installation question without a crash, use **Ask a question** or **Contact staff privately**.',
  },
  {
    category: 'performance',
    label: 'Report lag or low FPS',
    optionDescription: 'The game runs slowly, stutters, freezes, or has low FPS.',
    summary: 'Choose this when the game runs, but movement, rendering, loading, or server responses feel unusually slow.',
    examples: 'Low FPS, repeated stutters, long pauses near structures, delayed actions, or slow world generation.',
    preparation: 'Your modpack version, typical FPS, allocated RAM, where the slowdown happens, and what you were doing. Hardware, Java, launcher, shader, and render-distance details can also help.',
    nextStep: 'Answer questions in a private channel. Optional details can be skipped. Review your answers before confirming the performance report for staff review.',
    alternatives: 'If the game closes or cannot start, use **Game crashed or will not launch**. If a mechanic is wrong rather than slow, use **Report a gameplay bug**.',
  },
  {
    category: 'feedback',
    label: 'Share feedback',
    optionDescription: 'Tell us how the current gameplay, balance, or difficulty feels.',
    summary: 'Choose this to tell the team how the existing experience feels, including what you enjoyed and what could feel better.',
    examples: 'Combat feels too difficult, progression takes too long, a playtest was enjoyable, or an area feels confusing.',
    preparation: 'The part of the game you tried, your modpack version, and a specific example of your experience. Include a playtest session ID if you have one.',
    nextStep: 'Fill out a feedback form. Submitting it saves your feedback and sends it to the configured feedback forum or channel for review.',
    alternatives: 'For a new feature or a concrete change you want added, use **Suggest an idea**. For something broken, use **Report a gameplay bug**.',
  },
  {
    category: 'suggestion',
    label: 'Suggest an idea',
    optionDescription: 'Propose a new feature, content, or quality-of-life improvement.',
    summary: 'Choose this when you have a specific idea for new content or a change that would improve the modpack.',
    examples: 'A new quest, a useful item, clearer menus, an accessibility improvement, or a quality-of-life feature.',
    preparation: 'A clear title, what you would change, and why it would help players. Explain how you imagine it working.',
    nextStep: 'Fill out a suggestion form. Your submitted idea is saved and shared in the configured suggestions forum or channel, where players can vote.',
    alternatives: 'To describe how the current game feels without proposing a specific change, use **Share feedback**. Use **Report a gameplay bug** for a broken feature.',
  },
  {
    category: 'playtest',
    label: 'Get playtest help',
    optionDescription: 'Help with test builds, CurseForge setup, sessions, or Spark.',
    summary: 'Choose this for help getting into a playtest and keeping your test session, reports, and performance information organized.',
    examples: 'Finding the test ZIP, importing a build into CurseForge, starting a tester session, or learning when to use Spark profiling.',
    preparation: 'Read the rules and privacy message in the published playtest channel. Have your launcher ready. Start a tester session before playing so reports can be linked to it.',
    nextStep: 'You will see instructions for accepting the playtest terms, getting the build, and starting a session with /playtest start.',
    alternatives: 'For an actual crash, gameplay bug, or slowdown during testing, use the matching report option and include your playtest session ID.',
  },
  {
    category: 'question',
    label: 'Ask a question',
    optionDescription: 'Ask the community about gameplay, setup, or the modpack.',
    summary: 'Choose this for a general gameplay, setup, or modpack question that you are comfortable asking in the community.',
    examples: 'How to use an item, where to begin a quest, how a mechanic works, or which setup steps to follow.',
    preparation: 'A clear question, what you have already tried, and your modpack version if it matters. Keep account details and other private information out of public questions.',
    nextStep: 'You will be directed to the configured community Q&A forum or channels. The bot can answer recognized topics or ask support to follow up when you still need help.',
    alternatives: 'Use **Contact staff privately** for account or sensitive issues, or when community Q&A has not been configured. Use a report option for a specific bug, crash, or slowdown.',
  },
  {
    category: 'other',
    label: 'Contact staff privately',
    optionDescription: 'Open a private staff ticket for account issues or anything else.',
    summary: 'Choose this when you need to speak to the support team privately or the other options do not fit.',
    examples: 'Account or access problems, installation help that needs staff, trouble finding a log, or an issue you still cannot categorize.',
    preparation: 'A short summary and details about what you need, including what you have tried. Never include passwords, recovery codes, or tokens.',
    nextStep: 'Fill out a short form. The bot then creates a private ticket for you and staff. The support team can review the details and help with the next steps.',
    alternatives: 'For a general question that the community can answer, use **Ask a question**. A specific bug, crash, or performance report helps staff collect the right details.',
  },
] as const;

export type SupportGuideCategory = (typeof supportGuidePages)[number]['category'];

export const supportGuideOptions = supportGuidePages.map(page => ({
  value: page.category,
  label: page.label,
  optionDescription: page.optionDescription,
}));

export async function beginSupportGuide(interaction: ButtonInteraction | StringSelectMenuInteraction): Promise<void> {
  await interaction.reply({ ...supportGuidePayload(0), flags: 'Ephemeral' });
}

export async function handleSupportGuideButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith(guideButtonPrefix)) {
    return false;
  }

  const category = interaction.customId.slice(guideButtonPrefix.length);
  const pageIndex = supportGuidePages.findIndex(page => page.category === category);
  if (pageIndex === -1) {
    await interaction.reply({
      content: 'This guide page is no longer available. Select **Help me choose** in the support panel to reopen the guide.',
      flags: 'Ephemeral',
    });
    return true;
  }

  await interaction.update(supportGuidePayload(pageIndex));
  return true;
}

function supportGuidePayload(pageIndex: number) {
  const page = supportGuidePages[pageIndex];
  const previousPage = supportGuidePages[Math.max(0, pageIndex - 1)];
  const nextPage = supportGuidePages[Math.min(supportGuidePages.length - 1, pageIndex + 1)];
  const embed = baseEmbed(`Help me choose · ${page.label}`, page.summary)
    .setTimestamp(null)
    .addFields(
      { name: 'Examples', value: page.examples },
      { name: 'What to have ready', value: page.preparation },
      { name: 'What happens next', value: page.nextStep },
      { name: 'When another option fits better', value: page.alternatives },
    )
    .setFooter({ text: `Page ${pageIndex + 1} of ${supportGuidePages.length} · Use the arrows to browse, then choose the action below` });

  const navigation = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`${guideButtonPrefix}${previousPage.category}`)
      .setEmoji('◀️')
      .setLabel('Previous')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex === 0),
    new ButtonBuilder()
      .setCustomId(`${guideButtonPrefix}${nextPage.category}`)
      .setEmoji('▶️')
      .setLabel('Next')
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(pageIndex === supportGuidePages.length - 1),
  );
  const action = new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`supportpanel:category:${page.category}`)
      .setLabel(page.label)
      .setStyle(ButtonStyle.Primary),
  );

  return { embeds: [embed], components: [navigation, action] };
}
