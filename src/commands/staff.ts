import {
  ActionRowBuilder,
  ModalBuilder,
  ModalSubmitInteraction,
  PermissionsBitField,
  SlashCommandBuilder,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import type { ReportStatus, SlashCommand } from '../types';
import type { SparkReportStatus } from '../types/spark';
import type { SuggestionStatus } from '../types';
import { requireStaff } from '../utils/permissions';
import {
  addChangelogEntry,
  addKnownIssue,
  getKnownIssue,
  removeKnownIssue,
  updateKnownIssue
} from '../services/knownIssuesService';
import {
  applyBugForumStatusTags,
  getAnyReport,
  notifyBugReporterOfStatus,
  searchReports,
  updateReportStatus
} from '../services/reportService';
import {
  getSuggestion,
  getSuggestionVoteCounts,
  updateSuggestionStatus
} from '../services/suggestionService';
import {
  getSparkReport,
  updateSparkReportNotes,
  updateSparkReportStatus
} from '../services/sparkReportService';
import {
  addQaAnswer,
  getQaForward,
  listQaAnswers,
  qaForwardEmbed,
  removeQaAnswer
} from '../services/qaService';
import {
  getPlaytestSession,
  listLinkedReports
} from '../services/playtestSessionService';
import {
  bugReportEmbed,
  baseEmbed,
  changelogEmbed,
  crashReportEmbed,
  feedbackReportEmbed,
  knownIssuesEmbed,
  performanceReportEmbed,
  playtestSessionEmbed,
  searchResultsEmbed,
  sparkReportEmbed,
  suggestionEmbed,
  truncate
} from '../utils/embeds';

const bugReportStatuses = [
  { name: 'open', value: 'open' },
  { name: 'investigating', value: 'investigating' },
  { name: 'confirmed', value: 'confirmed' },
  { name: 'solved', value: 'solved' },
  { name: 'fixed', value: 'fixed' },
  { name: 'duplicate', value: 'duplicate' },
  { name: 'needs more info', value: 'needs_more_info' },
  { name: 'wontfix', value: 'wontfix' }
] as const;

const reportStatuses = [
  { name: 'open', value: 'open' },
  { name: 'investigating', value: 'investigating' },
  { name: 'fixed', value: 'fixed' },
  { name: 'duplicate', value: 'duplicate' },
  { name: 'needs more info', value: 'needs_more_info' },
  { name: 'wontfix', value: 'wontfix' }
] as const;

const suggestionStatuses = [
  { name: 'under review', value: 'under_review' },
  { name: 'planned', value: 'planned' },
  { name: 'accepted', value: 'accepted' },
  { name: 'rejected', value: 'rejected' },
  { name: 'added', value: 'added' }
] as const;

const sparkStatuses = [
  { name: 'new', value: 'new' },
  { name: 'needs review', value: 'needs_review' },
  { name: 'bottleneck found', value: 'bottleneck_found' },
  { name: 'not enough data', value: 'not_enough_data' },
  { name: 'resolved', value: 'resolved' }
] as const;

export const staffCommand: SlashCommand = {
  data: new SlashCommandBuilder()
    .setName('staff')
    .setDescription('Staff-only Wilderness Oddesy support tools.')
    .setDefaultMemberPermissions(PermissionsBitField.Flags.ModerateMembers)
    .addSubcommandGroup((group) =>
      group
        .setName('bug')
        .setDescription('Manage bug reports.')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('status')
            .setDescription('Update a bug report status.')
            .addStringOption((option) =>
              option
                .setName('id')
                .setDescription('Bug report ID, like WO-BUG-0001.')
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName('status')
                .setDescription('New report status.')
                .setRequired(true)
                .addChoices(...bugReportStatuses)
            )
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName('crash')
        .setDescription('Manage crash reports.')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('status')
            .setDescription('Update a crash report status.')
            .addStringOption((option) =>
              option
                .setName('id')
                .setDescription('Crash report ID, like WO-CRASH-0001.')
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName('status')
                .setDescription('New report status.')
                .setRequired(true)
                .addChoices(...reportStatuses)
            )
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName('issue')
        .setDescription('Manage known issues.')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('add')
            .setDescription('Add a known issue.')
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('remove')
            .setDescription('Remove a known issue.')
            .addIntegerOption((option) =>
              option
                .setName('id')
                .setDescription('Known issue numeric ID.')
                .setMinValue(1)
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('update')
            .setDescription('Update a known issue.')
            .addIntegerOption((option) =>
              option
                .setName('id')
                .setDescription('Known issue numeric ID.')
                .setMinValue(1)
                .setRequired(true)
            )
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName('changelog')
        .setDescription('Manage changelog entries.')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('add')
            .setDescription('Add a changelog entry.')
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName('suggestion')
        .setDescription('Manage suggestions.')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('status')
            .setDescription('Update a suggestion status.')
            .addStringOption((option) =>
              option
                .setName('id')
                .setDescription('Suggestion ID, like WO-SUG-0001.')
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName('status')
                .setDescription('New suggestion status.')
                .setRequired(true)
                .addChoices(...suggestionStatuses)
            )
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName('spark')
        .setDescription('Manage Spark reports.')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('status')
            .setDescription('Update a Spark report status.')
            .addStringOption((option) =>
              option
                .setName('id')
                .setDescription('Spark report ID, like WO-SPARK-0001.')
                .setRequired(true)
            )
            .addStringOption((option) =>
              option
                .setName('status')
                .setDescription('New Spark report status.')
                .setRequired(true)
                .addChoices(...sparkStatuses)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('notes')
            .setDescription('Add or replace staff notes on a Spark report.')
            .addStringOption((option) =>
              option
                .setName('id')
                .setDescription('Spark report ID, like WO-SPARK-0001.')
                .setRequired(true)
            )
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName('report')
        .setDescription('View or search reports.')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('view')
            .setDescription('View a report by ID.')
            .addStringOption((option) =>
              option
                .setName('id')
                .setDescription('Report ID, like WO-BUG-0001.')
                .setRequired(true)
            )
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('search')
            .setDescription('Search reports by keyword.')
            .addStringOption((option) =>
              option
                .setName('keyword')
                .setDescription('Keyword to search for.')
                .setMinLength(2)
                .setMaxLength(80)
                .setRequired(true)
            )
        )
    )
    .addSubcommandGroup((group) =>
      group
        .setName('qa')
        .setDescription('Manage Q&A canned answers.')
        .addSubcommand((subcommand) =>
          subcommand
            .setName('add')
            .setDescription('Add a Q&A answer.')
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('list')
            .setDescription('List recent Q&A answers.')
        )
        .addSubcommand((subcommand) =>
          subcommand
            .setName('remove')
            .setDescription('Disable a Q&A answer.')
            .addIntegerOption((option) =>
              option
                .setName('id')
                .setDescription('Q&A answer numeric ID.')
                .setMinValue(1)
                .setRequired(true)
            )
        )
    ),
  async execute(interaction) {
    if (!(await requireStaff(interaction))) {
      return;
    }

    const group = interaction.options.getSubcommandGroup(true);
    const subcommand = interaction.options.getSubcommand(true);

    if (group === 'bug' && subcommand === 'status') {
      const id = interaction.options.getString('id', true);
      const status = interaction.options.getString('status', true) as ReportStatus;
      const updated = updateReportStatus('bug', id, status, { addedBy: interaction.user.id });
      if (updated) {
        await applyBugForumStatusTags(interaction, status);
        await notifyBugReporterOfStatus(interaction.client, id, status);
      }

      await interaction.reply({
        content: updated ? `Bug report ${id.toUpperCase()} marked **${status}**.` : `No bug report found for ${id}.`,
        flags: 'Ephemeral'
      });
      return;
    }

    if (group === 'crash' && subcommand === 'status') {
      const id = interaction.options.getString('id', true);
      const status = interaction.options.getString('status', true) as ReportStatus;
      const updated = updateReportStatus('crash', id, status);
      await interaction.reply({
        content: updated ? `Crash report ${id.toUpperCase()} marked **${status}**.` : `No crash report found for ${id}.`,
        flags: 'Ephemeral'
      });
      return;
    }

    if (group === 'issue' && subcommand === 'add') {
      await interaction.showModal(issueModal('staff:issue-add'));
      return;
    }

    if (group === 'issue' && subcommand === 'remove') {
      const id = interaction.options.getInteger('id', true);
      const removed = removeKnownIssue(id);
      await interaction.reply({
        content: removed ? `Known issue #${id} removed.` : `No known issue found for #${id}.`,
        flags: 'Ephemeral'
      });
      return;
    }

    if (group === 'issue' && subcommand === 'update') {
      const id = interaction.options.getInteger('id', true);
      const issue = getKnownIssue(id);
      if (!issue) {
        await interaction.reply({ content: `No known issue found for #${id}.`, flags: 'Ephemeral' });
        return;
      }

      await interaction.showModal(issueModal(`staff:issue-update:${id}`, issue));
      return;
    }

    if (group === 'changelog' && subcommand === 'add') {
      await interaction.showModal(changelogModal());
      return;
    }

    if (group === 'suggestion' && subcommand === 'status') {
      const id = interaction.options.getString('id', true);
      const status = interaction.options.getString('status', true) as SuggestionStatus;
      const suggestion = updateSuggestionStatus(id, status);
      await interaction.reply({
        content: suggestion ? `Suggestion ${suggestion.publicId} marked **${status}**.` : `No suggestion found for ${id}.`,
        embeds: suggestion ? [suggestionEmbed(suggestion, getSuggestionVoteCounts(suggestion.publicId))] : [],
        flags: 'Ephemeral'
      });
      return;
    }

    if (group === 'spark' && subcommand === 'status') {
      const id = interaction.options.getString('id', true);
      const status = interaction.options.getString('status', true) as SparkReportStatus;
      const report = updateSparkReportStatus(id, status);
      await interaction.reply({
        content: report ? `Spark report ${report.publicId} marked **${status}**.` : `No Spark report found for ${id}.`,
        embeds: report ? [sparkReportEmbed(report, getPlaytestSession(report.sessionPublicId))] : [],
        flags: 'Ephemeral'
      });
      return;
    }

    if (group === 'spark' && subcommand === 'notes') {
      const id = interaction.options.getString('id', true).toUpperCase();
      await interaction.showModal(sparkNotesModal(id));
      return;
    }

    if (group === 'report' && subcommand === 'view') {
      const id = interaction.options.getString('id', true);
      const result = getAnyReport(id);

      const embed = result?.type === 'bug'
        ? bugReportEmbed(result.report)
        : result?.type === 'crash'
          ? crashReportEmbed(result.report)
          : result?.type === 'performance'
            ? performanceReportEmbed(result.report)
            : result?.type === 'feedback'
              ? feedbackReportEmbed(result.report)
              : suggestionReportEmbed(id);

      if (!embed) {
        await interaction.reply({ content: `No report found for ${id}.`, flags: 'Ephemeral' });
        return;
      }

      await interaction.reply({ embeds: [embed], flags: 'Ephemeral' });
      return;
    }

    if (group === 'report' && subcommand === 'search') {
      const keyword = interaction.options.getString('keyword', true);
      await interaction.reply({
        embeds: [searchResultsEmbed(keyword, searchReports(keyword))],
        flags: 'Ephemeral'
      });
      return;
    }

    if (group === 'qa' && subcommand === 'add') {
      await interaction.showModal(qaAnswerModal());
      return;
    }

    if (group === 'qa' && subcommand === 'list') {
      await interaction.reply({
        embeds: [qaAnswerListEmbed()],
        flags: 'Ephemeral'
      });
      return;
    }

    if (group === 'qa' && subcommand === 'remove') {
      const id = interaction.options.getInteger('id', true);
      const removed = removeQaAnswer(id);
      await interaction.reply({
        content: removed ? `Q&A answer #${id} disabled.` : `No Q&A answer found for #${id}.`,
        flags: 'Ephemeral'
      });
    }
  }
};

export async function handleStaffModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('staff:')) {
    return false;
  }

  if (!(await requireStaff(interaction))) {
    return true;
  }

  if (interaction.customId === 'staff:issue-add') {
    const issue = addKnownIssue({
      title: interaction.fields.getTextInputValue('issue_title'),
      description: interaction.fields.getTextInputValue('issue_description'),
      status: interaction.fields.getTextInputValue('issue_status'),
      severity: interaction.fields.getTextInputValue('issue_severity'),
      addedBy: interaction.user.id
    });

    await interaction.reply({
      content: `Known issue #${issue.id} added.`,
      embeds: [knownIssuesEmbed([issue])],
      flags: 'Ephemeral'
    });
    return true;
  }

  if (interaction.customId.startsWith('staff:issue-update:')) {
    const id = Number(interaction.customId.split(':')[2]);
    const issue = updateKnownIssue(id, {
      title: interaction.fields.getTextInputValue('issue_title'),
      description: interaction.fields.getTextInputValue('issue_description'),
      status: interaction.fields.getTextInputValue('issue_status'),
      severity: interaction.fields.getTextInputValue('issue_severity')
    });

    await interaction.reply({
      content: issue ? `Known issue #${id} updated.` : `No known issue found for #${id}.`,
      embeds: issue ? [knownIssuesEmbed([issue])] : [],
      flags: 'Ephemeral'
    });
    return true;
  }

  if (interaction.customId === 'staff:changelog-add') {
    const entry = addChangelogEntry({
      version: interaction.fields.getTextInputValue('version'),
      title: interaction.fields.getTextInputValue('title'),
      details: interaction.fields.getTextInputValue('details'),
      addedBy: interaction.user.id
    });

    await interaction.reply({
      content: `Changelog entry for ${entry.version} added.`,
      embeds: [changelogEmbed([entry])],
      flags: 'Ephemeral'
    });
    return true;
  }

  if (interaction.customId === 'staff:qa-add') {
    const answer = addQaAnswer({
      triggerTerms: interaction.fields.getTextInputValue('trigger_terms'),
      title: interaction.fields.getTextInputValue('title'),
      answer: interaction.fields.getTextInputValue('answer'),
      addedBy: interaction.user.id
    });

    await interaction.reply({
      content: `Q&A answer #${answer.id} added.`,
      embeds: [qaAnswerListEmbed()],
      flags: 'Ephemeral'
    });
    return true;
  }

  if (interaction.customId.startsWith('staff:spark-notes:')) {
    const publicId = interaction.customId.split(':')[2];
    const report = updateSparkReportNotes(publicId, interaction.fields.getTextInputValue('staff_notes'));

    await interaction.reply({
      content: report ? `Staff notes updated for ${report.publicId}.` : `No Spark report found for ${publicId}.`,
      embeds: report ? [sparkReportEmbed(report, getPlaytestSession(report.sessionPublicId))] : [],
      flags: 'Ephemeral'
    });
    return true;
  }

  return false;
}

function issueModal(customId: string, existing?: {
  title: string;
  description: string;
  status: string;
  severity: string;
}): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(customId)
    .setTitle(existing ? 'Update Known Issue' : 'Add Known Issue')
    .addComponents(
      staffTextInputRow('issue_title', 'Title', TextInputStyle.Short, true, 'Short issue title', existing?.title),
      staffTextInputRow('issue_description', 'Description', TextInputStyle.Paragraph, true, 'What players need to know.', existing?.description),
      staffTextInputRow('issue_status', 'Status', TextInputStyle.Short, true, 'open, investigating, monitoring, fixed', existing?.status ?? 'open'),
      staffTextInputRow('issue_severity', 'Severity', TextInputStyle.Short, true, 'low, medium, high, critical', existing?.severity ?? 'medium')
    );
}

function changelogModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('staff:changelog-add')
    .setTitle('Add Changelog Entry')
    .addComponents(
      staffTextInputRow('version', 'Version', TextInputStyle.Short, true, 'Example: 0.1.1'),
      staffTextInputRow('title', 'Title', TextInputStyle.Short, true, 'Short changelog title'),
      staffTextInputRow('details', 'Details', TextInputStyle.Paragraph, true, 'Bullet-style notes are welcome.')
    );
}

function qaAnswerModal(): ModalBuilder {
  return new ModalBuilder()
    .setCustomId('staff:qa-add')
    .setTitle('Add Q&A Answer')
    .addComponents(
      staffTextInputRow('trigger_terms', 'Trigger terms', TextInputStyle.Short, true, 'comma separated, like java, jdk, class file'),
      staffTextInputRow('title', 'Answer title', TextInputStyle.Short, true, 'Example: Java Version'),
      staffTextInputRow('answer', 'Answer text', TextInputStyle.Paragraph, true, 'The response players should receive.')
    );
}

function sparkNotesModal(publicId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`staff:spark-notes:${publicId}`)
    .setTitle('Spark Staff Notes')
    .addComponents(
      staffTextInputRow('staff_notes', 'Staff notes', TextInputStyle.Paragraph, true, 'Bottleneck notes, follow-up steps, or why the data was insufficient.')
    );
}

function qaAnswerListEmbed() {
  const answers = listQaAnswers();
  const embed = baseEmbed('Q&A Answers', 'Recent staff-defined canned answers.');

  if (answers.length === 0) {
    return embed.setDescription('No Q&A answers have been added yet.');
  }

  for (const answer of answers) {
    embed.addFields({
      name: `#${answer.id} - ${truncate(answer.title, 180)}${answer.enabled ? '' : ' (disabled)'}`,
      value: `Triggers: ${truncate(answer.triggerTerms, 300)}\n${truncate(answer.answer, 650)}`
    });
  }

  return embed;
}

function suggestionReportEmbed(id: string) {
  const suggestion = getSuggestion(id);
  if (suggestion) {
    return suggestionEmbed(suggestion, getSuggestionVoteCounts(suggestion.publicId));
  }

  const spark = getSparkReport(id);
  if (spark) {
    return sparkReportEmbed(spark, getPlaytestSession(spark.sessionPublicId));
  }

  const playtest = getPlaytestSession(id);
  if (playtest) {
    return playtestSessionEmbed(playtest, listLinkedReports(playtest.publicId));
  }

  const qaForward = getQaForward(id);
  if (qaForward) {
    return qaForwardEmbed(qaForward);
  }

  return null;
}

function staffTextInputRow(
  customId: string,
  label: string,
  style: TextInputStyle,
  required: boolean,
  placeholder?: string,
  value?: string
): ActionRowBuilder<TextInputBuilder> {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required);

  if (placeholder) {
    input.setPlaceholder(placeholder);
  }

  if (value) {
    input.setValue(value.slice(0, style === TextInputStyle.Paragraph ? 4000 : 100));
  }

  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}
