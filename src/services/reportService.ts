import {
  ActionRowBuilder,
  Attachment,
  ButtonBuilder,
  ButtonInteraction,
  ButtonStyle,
  ChatInputCommandInteraction,
  Client,
  EmbedBuilder,
  MessageCreateOptions,
  ModalBuilder,
  ModalSubmitInteraction,
  StringSelectMenuInteraction,
  TextInputBuilder,
  TextInputStyle
} from 'discord.js';
import { randomUUID } from 'node:crypto';
import { getDb } from '../db';
import type {
  BugReportRecord,
  CrashReportRecord,
  FeedbackReportRecord,
  PerformanceReportRecord,
  ReportActionType,
  ReportSearchResult,
  ReportStatus
} from '../types';
import { config } from '../config';
import { redactLog } from './logParser';
import { linkReportToSession } from './playtestSessionService';
import { isSparkReportUrl } from './sparkReportService';
import { formatPublicId, normalizePublicId } from '../utils/ids';
import { isStaff, requireStaff } from '../utils/permissions';
import {
  bugReportEmbed,
  crashReportEmbed,
  feedbackReportEmbed,
  performanceReportEmbed,
  sparkReportEmbed
} from '../utils/embeds';
import {
  getSparkReport
} from './sparkReportService';
import {
  getPlaytestSession
} from './playtestSessionService';

interface BugDraft {
  userId: string;
  minecraftVersion: string | null;
  loaderVersion: string | null;
  playMode: string;
  location: string | null;
  anomalyContext: string | null;
  repeatable: string | null;
  sparkLink: string | null;
  attachmentUrl: string | null;
  attachmentName: string | null;
  screenshotUrl: string | null;
  screenshotName: string | null;
  logAttachmentUrl: string | null;
  logAttachmentName: string | null;
  logAttachmentSize: number | null;
  playtestSessionId: string | null;
}

interface PerformanceDraft {
  userId: string;
  cpuGpu: string | null;
  javaVersion: string | null;
  launcher: string | null;
  shaders: string | null;
  renderDistance: number | null;
}

interface FeedbackDraft {
  userId: string;
  category: string;
  modpackVersion: string | null;
  playtestSessionId: string | null;
}

interface BugRow {
  id: number;
  public_id: string;
  user_id: string;
  username: string;
  modpack_version: string;
  minecraft_version: string | null;
  loader_version: string | null;
  play_mode: string;
  happened: string;
  expected: string;
  steps: string;
  location: string | null;
  anomaly_context: string | null;
  repeatable: string | null;
  spark_link: string | null;
  attachment_url: string | null;
  attachment_name: string | null;
  screenshot_url: string | null;
  screenshot_name: string | null;
  log_file_name: string | null;
  redacted_log: string | null;
  claimed_by: string | null;
  claimed_by_username: string | null;
  claimed_at: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
}

interface CrashRow {
  id: number;
  public_id: string;
  user_id: string;
  username: string;
  file_name: string;
  file_size: number;
  redacted_log: string;
  likely_cause: string;
  confidence: string;
  next_steps: string;
  claimed_by: string | null;
  claimed_by_username: string | null;
  claimed_at: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
}

interface PerformanceRow {
  id: number;
  public_id: string;
  user_id: string;
  username: string;
  modpack_version: string;
  fps_average: string;
  ram_allocated: string;
  cpu_gpu: string | null;
  java_version: string | null;
  launcher: string | null;
  shaders: string | null;
  render_distance: number | null;
  lag_location: string;
  activity: string;
  claimed_by: string | null;
  claimed_by_username: string | null;
  claimed_at: string | null;
  status: ReportStatus;
  created_at: string;
  updated_at: string;
}

interface FeedbackRow {
  id: number;
  public_id: string;
  user_id: string;
  username: string;
  category: string;
  modpack_version: string | null;
  summary: string;
  details: string;
  created_at: string;
}

const bugDrafts = new Map<string, BugDraft>();
const performanceDrafts = new Map<string, PerformanceDraft>();
const feedbackDrafts = new Map<string, FeedbackDraft>();

export function normalizeReportId(value: string): string {
  return normalizePublicId(value);
}

export async function sendToConfiguredChannel(
  client: Client,
  channelId: string | undefined,
  payload: MessageCreateOptions
): Promise<boolean> {
  if (!channelId) {
    return false;
  }

  const channel = await client.channels.fetch(channelId).catch(() => null);
  if (!channel || !channel.isSendable()) {
    return false;
  }

  await channel.send(payload);
  return true;
}

export async function readTextAttachment(attachment: Attachment): Promise<string> {
  return readTextAttachmentUrl(attachment.name, attachment.size, attachment.url);
}

export async function readTextAttachmentUrl(name: string, size: number, url: string): Promise<string> {
  const lowerName = name.toLowerCase();
  if (!lowerName.endsWith('.txt') && !lowerName.endsWith('.log')) {
    throw new Error('Please attach a `.txt` or `.log` file.');
  }

  if (size > config.maxLogBytes) {
    throw new Error(`That file is too large. The current limit is ${Math.floor(config.maxLogBytes / 1024)} KB.`);
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 15_000);

  try {
    const response = await fetch(url, { signal: controller.signal });
    if (!response.ok) {
      throw new Error(`Discord returned HTTP ${response.status} while reading the attachment.`);
    }

    const buffer = Buffer.from(await response.arrayBuffer());
    if (buffer.byteLength > config.maxLogBytes) {
      throw new Error(`That file is too large. The current limit is ${Math.floor(config.maxLogBytes / 1024)} KB.`);
    }

    return buffer.toString('utf8');
  } finally {
    clearTimeout(timeout);
  }
}

export async function beginBugReport(interaction: ChatInputCommandInteraction): Promise<void> {
  const draftId = randomUUID().slice(0, 10);
  const screenshot = interaction.options.getAttachment('screenshot');
  const logAttachment = interaction.options.getAttachment('log_attachment');
  const sparkLink = interaction.options.getString('spark_link');

  if (sparkLink && !isSparkReportUrl(sparkLink)) {
    await interaction.reply({
      content: 'That Spark link does not look like a public Spark viewer/report URL. You can leave it blank or submit a valid Spark link.',
      ephemeral: true
    });
    return;
  }

  bugDrafts.set(draftId, {
    userId: interaction.user.id,
    minecraftVersion: interaction.options.getString('minecraft_version'),
    loaderVersion: interaction.options.getString('loader_version'),
    playMode: interaction.options.getString('play_mode', true),
    location: interaction.options.getString('location'),
    anomalyContext: interaction.options.getString('nearby_feature'),
    repeatable: interaction.options.getString('repeatable'),
    sparkLink,
    attachmentUrl: screenshot?.url ?? null,
    attachmentName: screenshot?.name ?? null,
    screenshotUrl: screenshot?.url ?? null,
    screenshotName: screenshot?.name ?? null,
    logAttachmentUrl: logAttachment?.url ?? null,
    logAttachmentName: logAttachment?.name ?? null,
    logAttachmentSize: logAttachment?.size ?? null,
    playtestSessionId: interaction.options.getString('playtest_session')
  });

  await interaction.showModal(bugReportModal(draftId));
}

export async function beginBugReportFromPanel(interaction: StringSelectMenuInteraction): Promise<void> {
  const draftId = randomUUID().slice(0, 10);

  bugDrafts.set(draftId, {
    userId: interaction.user.id,
    minecraftVersion: null,
    loaderVersion: null,
    playMode: 'Not specified from support panel',
    location: null,
    anomalyContext: null,
    repeatable: null,
    sparkLink: null,
    attachmentUrl: null,
    attachmentName: null,
    screenshotUrl: null,
    screenshotName: null,
    logAttachmentUrl: null,
    logAttachmentName: null,
    logAttachmentSize: null,
    playtestSessionId: null
  });

  await interaction.showModal(bugReportModal(draftId));
}

export async function handleBugReportModal(interaction: ModalSubmitInteraction): Promise<void> {
  const draftId = interaction.customId.split(':')[1];
  const draft = bugDrafts.get(draftId);

  if (!draft || draft.userId !== interaction.user.id) {
    await interaction.reply({
      content: 'That bug report form expired. Please run `/bugreport` again.',
      ephemeral: true
    });
    return;
  }

  bugDrafts.delete(draftId);
  await interaction.deferReply({ ephemeral: true });

  let redactedLog: string | null = null;
  if (draft.logAttachmentUrl && draft.logAttachmentName && draft.logAttachmentSize !== null) {
    try {
      const logText = await readTextAttachmentUrl(draft.logAttachmentName, draft.logAttachmentSize, draft.logAttachmentUrl);
      redactedLog = redactLog(logText).slice(0, 120_000);
    } catch (error) {
      await interaction.editReply({
        content: error instanceof Error
          ? `I could not process the attached log: ${error.message}`
          : 'I could not process the attached log.'
      });
      return;
    }
  }

  const report = createBugReport({
    userId: interaction.user.id,
    username: interaction.user.tag,
    modpackVersion: interaction.fields.getTextInputValue('modpack_version'),
    minecraftVersion: draft.minecraftVersion,
    loaderVersion: draft.loaderVersion,
    playMode: draft.playMode,
    happened: interaction.fields.getTextInputValue('happened'),
    expected: interaction.fields.getTextInputValue('expected'),
    steps: interaction.fields.getTextInputValue('steps'),
    location: draft.location,
    anomalyContext: draft.anomalyContext,
    repeatable: draft.repeatable,
    sparkLink: draft.sparkLink,
    attachmentUrl: draft.attachmentUrl,
    attachmentName: draft.attachmentName,
    screenshotUrl: draft.screenshotUrl,
    screenshotName: draft.screenshotName,
    logFileName: draft.logAttachmentName,
    redactedLog
  });

  if (draft.playtestSessionId) {
    linkReportToSession(draft.playtestSessionId, 'bug', report.publicId);
  }

  const posted = await sendToConfiguredChannel(interaction.client, config.channelIds.bugReports, {
    embeds: [bugReportEmbed(report)],
    components: [bugStatusButtons(report.publicId), reportClaimButtons('bug', report.publicId)]
  });

  await interaction.editReply({
    content: `Bug report received. The dev team has been notified. Your bug ID is **${report.publicId}**.${posted ? '' : ' Staff channel posting is not configured yet, but the report was saved locally.'}`,
    components: [reportReceiptButtons('bug', report.publicId)]
  });
}

export async function beginPerformanceReport(interaction: ChatInputCommandInteraction): Promise<void> {
  const draftId = randomUUID().slice(0, 10);

  performanceDrafts.set(draftId, {
    userId: interaction.user.id,
    cpuGpu: interaction.options.getString('cpu_gpu'),
    javaVersion: interaction.options.getString('java_version'),
    launcher: interaction.options.getString('launcher'),
    shaders: interaction.options.getString('shaders'),
    renderDistance: interaction.options.getInteger('render_distance')
  });

  await interaction.showModal(performanceReportModal(draftId));
}

export async function beginPerformanceReportFromPanel(interaction: StringSelectMenuInteraction): Promise<void> {
  const draftId = randomUUID().slice(0, 10);

  performanceDrafts.set(draftId, {
    userId: interaction.user.id,
    cpuGpu: null,
    javaVersion: null,
    launcher: null,
    shaders: null,
    renderDistance: null
  });

  await interaction.showModal(performanceReportModal(draftId));
}

export async function handlePerformanceReportModal(interaction: ModalSubmitInteraction): Promise<void> {
  const draftId = interaction.customId.split(':')[1];
  const draft = performanceDrafts.get(draftId);

  if (!draft || draft.userId !== interaction.user.id) {
    await interaction.reply({
      content: 'That performance report form expired. Please run `/perfreport` again.',
      ephemeral: true
    });
    return;
  }

  performanceDrafts.delete(draftId);

  const report = createPerformanceReport({
    userId: interaction.user.id,
    username: interaction.user.tag,
    modpackVersion: interaction.fields.getTextInputValue('modpack_version'),
    fpsAverage: interaction.fields.getTextInputValue('fps_average'),
    ramAllocated: interaction.fields.getTextInputValue('ram_allocated'),
    cpuGpu: draft.cpuGpu,
    javaVersion: draft.javaVersion,
    launcher: draft.launcher,
    shaders: draft.shaders,
    renderDistance: draft.renderDistance,
    lagLocation: interaction.fields.getTextInputValue('lag_location'),
    activity: interaction.fields.getTextInputValue('activity')
  });

  const posted = await sendToConfiguredChannel(interaction.client, config.channelIds.performanceReports, {
    embeds: [performanceReportEmbed(report)],
    components: [reportClaimButtons('performance', report.publicId)]
  });

  await interaction.reply({
    content: `Performance report received. Your report ID is **${report.publicId}**.${posted ? '' : ' Staff channel posting is not configured yet, but the report was saved locally.'}`,
    components: [reportReceiptButtons('performance', report.publicId)],
    ephemeral: true
  });
}

export async function beginFeedbackReport(interaction: ChatInputCommandInteraction): Promise<void> {
  const draftId = randomUUID().slice(0, 10);

  feedbackDrafts.set(draftId, {
    userId: interaction.user.id,
    category: interaction.options.getString('category', true),
    modpackVersion: interaction.options.getString('modpack_version'),
    playtestSessionId: interaction.options.getString('playtest_session')
  });

  await interaction.showModal(feedbackReportModal(draftId));
}

export async function beginFeedbackReportFromPanel(interaction: StringSelectMenuInteraction): Promise<void> {
  const draftId = randomUUID().slice(0, 10);

  feedbackDrafts.set(draftId, {
    userId: interaction.user.id,
    category: 'General playtest feedback',
    modpackVersion: null,
    playtestSessionId: null
  });

  await interaction.showModal(feedbackReportModal(draftId));
}

export async function handleFeedbackModal(interaction: ModalSubmitInteraction): Promise<void> {
  const draftId = interaction.customId.split(':')[1];
  const draft = feedbackDrafts.get(draftId);

  if (!draft || draft.userId !== interaction.user.id) {
    await interaction.reply({
      content: 'That feedback form expired. Please run `/feedback` again.',
      ephemeral: true
    });
    return;
  }

  feedbackDrafts.delete(draftId);

  const report = createFeedbackReport({
    userId: interaction.user.id,
    username: interaction.user.tag,
    category: draft.category,
    modpackVersion: draft.modpackVersion,
    summary: interaction.fields.getTextInputValue('summary'),
    details: interaction.fields.getTextInputValue('details')
  });

  if (draft.playtestSessionId) {
    linkReportToSession(draft.playtestSessionId, 'feedback', report.publicId);
  }

  const posted = await sendToConfiguredChannel(interaction.client, config.channelIds.feedbackReports, {
    embeds: [feedbackReportEmbed(report)]
  });

  await interaction.reply({
    content: `Field notes received. Your feedback ID is **${report.publicId}**.${posted ? '' : ' Staff channel posting is not configured yet, but the report was saved locally.'}`,
    components: [reportReceiptButtons('feedback', report.publicId)],
    ephemeral: true
  });
}

export function createBugReport(
  input: Omit<BugReportRecord, 'id' | 'publicId' | 'claimedBy' | 'claimedByUsername' | 'claimedAt' | 'status' | 'createdAt' | 'updatedAt'>
): BugReportRecord {
  const database = getDb();
  const info = database.prepare(`
    INSERT INTO bug_reports (
      user_id, username, modpack_version, minecraft_version, loader_version,
      play_mode, happened, expected, steps, location, anomaly_context,
      repeatable, spark_link, attachment_url, attachment_name, screenshot_url,
      screenshot_name, log_file_name, redacted_log
    ) VALUES (
      @userId, @username, @modpackVersion, @minecraftVersion, @loaderVersion,
      @playMode, @happened, @expected, @steps, @location, @anomalyContext,
      @repeatable, @sparkLink, @attachmentUrl, @attachmentName, @screenshotUrl,
      @screenshotName, @logFileName, @redactedLog
    )
  `).run(input);

  const id = Number(info.lastInsertRowid);
  const publicId = formatPublicId('bug', id);
  database.prepare('UPDATE bug_reports SET public_id = @publicId WHERE id = @id').run({ publicId, id });

  const report = getBugReport(publicId);
  if (!report) {
    throw new Error(`Failed to read created bug report ${publicId}`);
  }

  return report;
}

export function createCrashReport(
  input: Omit<CrashReportRecord, 'id' | 'publicId' | 'claimedBy' | 'claimedByUsername' | 'claimedAt' | 'status' | 'createdAt' | 'updatedAt'>
): CrashReportRecord {
  const database = getDb();
  const info = database.prepare(`
    INSERT INTO crash_reports (
      user_id, username, file_name, file_size, redacted_log, likely_cause, confidence, next_steps
    ) VALUES (
      @userId, @username, @fileName, @fileSize, @redactedLog, @likelyCause, @confidence, @nextSteps
    )
  `).run(input);

  const id = Number(info.lastInsertRowid);
  const publicId = formatPublicId('crash', id);
  database.prepare('UPDATE crash_reports SET public_id = @publicId WHERE id = @id').run({ publicId, id });

  const report = getCrashReport(publicId);
  if (!report) {
    throw new Error(`Failed to read created crash report ${publicId}`);
  }

  return report;
}

export function createPerformanceReport(
  input: Omit<PerformanceReportRecord, 'id' | 'publicId' | 'claimedBy' | 'claimedByUsername' | 'claimedAt' | 'status' | 'createdAt' | 'updatedAt'>
): PerformanceReportRecord {
  const database = getDb();
  const info = database.prepare(`
    INSERT INTO performance_reports (
      user_id, username, modpack_version, fps_average, ram_allocated, cpu_gpu,
      java_version, launcher, shaders, render_distance, lag_location, activity
    ) VALUES (
      @userId, @username, @modpackVersion, @fpsAverage, @ramAllocated, @cpuGpu,
      @javaVersion, @launcher, @shaders, @renderDistance, @lagLocation, @activity
    )
  `).run(input);

  const id = Number(info.lastInsertRowid);
  const publicId = formatPublicId('performance', id);
  database.prepare('UPDATE performance_reports SET public_id = @publicId WHERE id = @id').run({ publicId, id });

  const report = getPerformanceReport(publicId);
  if (!report) {
    throw new Error(`Failed to read created performance report ${publicId}`);
  }

  return report;
}

export function createFeedbackReport(
  input: Omit<FeedbackReportRecord, 'id' | 'publicId' | 'createdAt'>
): FeedbackReportRecord {
  const database = getDb();
  const info = database.prepare(`
    INSERT INTO feedback_reports (
      user_id, username, category, modpack_version, summary, details
    ) VALUES (
      @userId, @username, @category, @modpackVersion, @summary, @details
    )
  `).run(input);

  const id = Number(info.lastInsertRowid);
  const publicId = formatPublicId('feedback', id);
  database.prepare('UPDATE feedback_reports SET public_id = @publicId WHERE id = @id').run({ publicId, id });

  const report = getFeedbackReport(publicId);
  if (!report) {
    throw new Error(`Failed to read created feedback report ${publicId}`);
  }

  return report;
}

export function getBugReport(publicId: string): BugReportRecord | null {
  const row = getDb().prepare('SELECT * FROM bug_reports WHERE public_id = ?').get(normalizeReportId(publicId)) as BugRow | undefined;
  return row ? mapBug(row) : null;
}

export function getCrashReport(publicId: string): CrashReportRecord | null {
  const row = getDb().prepare('SELECT * FROM crash_reports WHERE public_id = ?').get(normalizeReportId(publicId)) as CrashRow | undefined;
  return row ? mapCrash(row) : null;
}

export function getPerformanceReport(publicId: string): PerformanceReportRecord | null {
  const row = getDb().prepare('SELECT * FROM performance_reports WHERE public_id = ?').get(normalizeReportId(publicId)) as PerformanceRow | undefined;
  return row ? mapPerformance(row) : null;
}

export function getFeedbackReport(publicId: string): FeedbackReportRecord | null {
  const row = getDb().prepare('SELECT * FROM feedback_reports WHERE public_id = ?').get(normalizeReportId(publicId)) as FeedbackRow | undefined;
  return row ? mapFeedback(row) : null;
}

export type AnyReport =
  | { type: 'bug'; report: BugReportRecord }
  | { type: 'crash'; report: CrashReportRecord }
  | { type: 'performance'; report: PerformanceReportRecord }
  | { type: 'feedback'; report: FeedbackReportRecord };

export function getAnyReport(publicId: string): AnyReport | null {
  const normalized = normalizeReportId(publicId);

  if (normalized.startsWith('WO-BUG-')) {
    const report = getBugReport(normalized);
    return report ? { type: 'bug', report } : null;
  }

  if (normalized.startsWith('WO-CRASH-')) {
    const report = getCrashReport(normalized);
    return report ? { type: 'crash', report } : null;
  }

  if (normalized.startsWith('WO-PERF-')) {
    const report = getPerformanceReport(normalized);
    return report ? { type: 'performance', report } : null;
  }

  if (normalized.startsWith('WO-FDBK-')) {
    const report = getFeedbackReport(normalized);
    return report ? { type: 'feedback', report } : null;
  }

  const bug = getBugReport(normalized);
  if (bug) {
    return { type: 'bug', report: bug };
  }

  const crash = getCrashReport(normalized);
  if (crash) {
    return { type: 'crash', report: crash };
  }

  const performance = getPerformanceReport(normalized);
  if (performance) {
    return { type: 'performance', report: performance };
  }

  const feedback = getFeedbackReport(normalized);
  return feedback ? { type: 'feedback', report: feedback } : null;
}

export function updateReportStatus(type: 'bug' | 'crash' | 'performance', publicId: string, status: ReportStatus): boolean {
  const table = {
    bug: 'bug_reports',
    crash: 'crash_reports',
    performance: 'performance_reports'
  }[type];

  const result = getDb()
    .prepare(`UPDATE ${table} SET status = @status, updated_at = datetime('now') WHERE public_id = @publicId`)
    .run({ status, publicId: normalizeReportId(publicId) });

  return result.changes > 0;
}

export function reportClaimButtons(type: Exclude<ReportActionType, 'feedback'>, publicId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`reportclaim:${type}:${publicId}`)
      .setLabel('Claim / Reassign')
      .setStyle(ButtonStyle.Primary)
  );
}

export function reportReceiptButtons(type: ReportActionType, publicId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`reportinfo:${type}:${publicId}`)
      .setLabel('Add more info')
      .setStyle(ButtonStyle.Secondary)
  );
}

export async function handleReportActionButton(interaction: ButtonInteraction): Promise<boolean> {
  if (interaction.customId.startsWith('reportclaim:')) {
    if (!(await requireStaff(interaction))) {
      return true;
    }

    const [, type, publicId] = interaction.customId.split(':') as [string, Exclude<ReportActionType, 'feedback'>, string];
    const updated = claimReport(type, publicId, interaction.user.id, interaction.user.tag);
    if (!updated) {
      await interaction.reply({ content: `No report found for ${publicId}.`, ephemeral: true });
      return true;
    }

    const messageUpdate = reportMessageUpdate(type, publicId);
    if (messageUpdate) {
      await interaction.update(messageUpdate);
    } else {
      await interaction.reply({ content: `Claimed ${publicId}.`, ephemeral: true });
    }
    return true;
  }

  if (interaction.customId.startsWith('reportinfo:')) {
    const [, type, publicId] = interaction.customId.split(':') as [string, ReportActionType, string];
    const owner = getReportOwner(type, publicId);
    if (!owner) {
      await interaction.reply({ content: `No report found for ${publicId}.`, ephemeral: true });
      return true;
    }

    if (owner.userId !== interaction.user.id && !isStaff(interaction)) {
      await interaction.reply({
        content: 'Only the report submitter or staff can add more information to this report.',
        ephemeral: true
      });
      return true;
    }

    await interaction.showModal(new ModalBuilder()
      .setCustomId(`reportinfo:${type}:${publicId}`)
      .setTitle(`Add Info ${publicId}`)
      .addComponents(textInputRow('details', 'New details', TextInputStyle.Paragraph, true, 'Add reproduction notes, extra context, or what changed.'))
    );
    return true;
  }

  return false;
}

export async function handleReportUpdateModal(interaction: ModalSubmitInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('reportinfo:')) {
    return false;
  }

  const [, type, publicId] = interaction.customId.split(':') as [string, ReportActionType, string];
  const owner = getReportOwner(type, publicId);
  if (!owner) {
    await interaction.reply({ content: `No report found for ${publicId}.`, ephemeral: true });
    return true;
  }

  if (owner.userId !== interaction.user.id && !isStaff(interaction)) {
    await interaction.reply({
      content: 'Only the report submitter or staff can add more information to this report.',
      ephemeral: true
    });
    return true;
  }

  const details = interaction.fields.getTextInputValue('details');
  appendReportUpdate({
    reportType: type,
    reportPublicId: publicId,
    userId: interaction.user.id,
    username: interaction.user.tag,
    details
  });

  await sendToConfiguredChannel(interaction.client, reportChannelForType(type), {
    embeds: [
      feedbackReportUpdateEmbed(type, normalizeReportId(publicId), interaction.user.id, details)
    ]
  });

  await interaction.reply({
    content: `Added more information to **${normalizeReportId(publicId)}**.`,
    ephemeral: true
  });
  return true;
}

function claimReport(type: Exclude<ReportActionType, 'feedback'>, publicId: string, userId: string, username: string): boolean {
  const table = reportTableForClaim(type);
  if (!table) {
    return false;
  }

  const result = getDb().prepare(`
    UPDATE ${table}
    SET claimed_by = @userId,
        claimed_by_username = @username,
        claimed_at = datetime('now'),
        updated_at = datetime('now')
    WHERE public_id = @publicId
  `).run({ userId, username, publicId: normalizeReportId(publicId) });

  return result.changes > 0;
}

function reportMessageUpdate(type: Exclude<ReportActionType, 'feedback'>, publicId: string) {
  if (type === 'bug') {
    const report = getBugReport(publicId);
    return report
      ? { embeds: [bugReportEmbed(report)], components: [bugStatusButtons(report.publicId), reportClaimButtons('bug', report.publicId)] }
      : null;
  }

  if (type === 'crash') {
    const report = getCrashReport(publicId);
    return report
      ? { embeds: [crashReportEmbed(report)], components: [reportClaimButtons('crash', report.publicId)] }
      : null;
  }

  if (type === 'performance') {
    const report = getPerformanceReport(publicId);
    return report
      ? { embeds: [performanceReportEmbed(report)], components: [reportClaimButtons('performance', report.publicId)] }
      : null;
  }

  const spark = getSparkReport(publicId);
  return spark
    ? { embeds: [sparkReportEmbed(spark, getPlaytestSession(spark.sessionPublicId))], components: [reportClaimButtons('spark', spark.publicId)] }
    : null;
}

function getReportOwner(type: ReportActionType, publicId: string): { userId: string } | null {
  const table = reportTableForOwner(type);
  if (!table) {
    return null;
  }

  const row = getDb()
    .prepare(`SELECT user_id FROM ${table} WHERE public_id = ?`)
    .get(normalizeReportId(publicId)) as { user_id: string } | undefined;

  return row ? { userId: row.user_id } : null;
}

function appendReportUpdate(input: {
  reportType: ReportActionType;
  reportPublicId: string;
  userId: string;
  username: string;
  details: string;
}): void {
  getDb().prepare(`
    INSERT INTO report_updates (
      report_type, report_public_id, user_id, username, details
    ) VALUES (
      @reportType, @reportPublicId, @userId, @username, @details
    )
  `).run({
    ...input,
    reportPublicId: normalizeReportId(input.reportPublicId)
  });
}

function reportTableForClaim(type: Exclude<ReportActionType, 'feedback'>): string | null {
  return {
    bug: 'bug_reports',
    crash: 'crash_reports',
    performance: 'performance_reports',
    spark: 'spark_reports'
  }[type] ?? null;
}

function reportTableForOwner(type: ReportActionType): string | null {
  return {
    bug: 'bug_reports',
    crash: 'crash_reports',
    performance: 'performance_reports',
    feedback: 'feedback_reports',
    spark: 'spark_reports'
  }[type] ?? null;
}

function reportChannelForType(type: ReportActionType): string | undefined {
  return {
    bug: config.channelIds.bugReports,
    crash: config.channelIds.crashReports,
    performance: config.channelIds.performanceReports,
    feedback: config.channelIds.feedbackReports,
    spark: config.channelIds.sparkReports
  }[type];
}

function feedbackReportUpdateEmbed(type: ReportActionType, publicId: string, userId: string, details: string): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`Report Update ${publicId}`)
    .setColor(0x4f7f5f)
    .setTimestamp()
    .addFields(
      { name: 'Report type', value: type, inline: true },
      { name: 'Submitted by', value: `<@${userId}>`, inline: true },
      { name: 'New details', value: details.slice(0, 1024) }
    );
}

export function searchReports(keyword: string): ReportSearchResult[] {
  const like = `%${keyword.trim()}%`;
  const database = getDb();

  const bugs = database.prepare(`
    SELECT 'bug' AS type, public_id AS publicId, happened AS title, status, created_at AS createdAt
    FROM bug_reports
    WHERE public_id LIKE @like
      OR happened LIKE @like
      OR expected LIKE @like
      OR steps LIKE @like
      OR modpack_version LIKE @like
      OR minecraft_version LIKE @like
      OR loader_version LIKE @like
      OR anomaly_context LIKE @like
    ORDER BY id DESC
    LIMIT 10
  `).all({ like }) as unknown as ReportSearchResult[];

  const crashes = database.prepare(`
    SELECT 'crash' AS type, public_id AS publicId, likely_cause AS title, status, created_at AS createdAt
    FROM crash_reports
    WHERE public_id LIKE @like OR likely_cause LIKE @like OR redacted_log LIKE @like
    ORDER BY id DESC
    LIMIT 10
  `).all({ like }) as unknown as ReportSearchResult[];

  const performance = database.prepare(`
    SELECT 'performance' AS type, public_id AS publicId, lag_location AS title, status, created_at AS createdAt
    FROM performance_reports
    WHERE public_id LIKE @like OR lag_location LIKE @like OR activity LIKE @like OR modpack_version LIKE @like
    ORDER BY id DESC
    LIMIT 10
  `).all({ like }) as unknown as ReportSearchResult[];

  const feedback = database.prepare(`
    SELECT 'feedback' AS type, public_id AS publicId, summary AS title, NULL AS status, created_at AS createdAt
    FROM feedback_reports
    WHERE public_id LIKE @like OR summary LIKE @like OR details LIKE @like OR category LIKE @like
    ORDER BY id DESC
    LIMIT 10
  `).all({ like }) as unknown as ReportSearchResult[];

  const suggestions = database.prepare(`
    SELECT 'suggestion' AS type, public_id AS publicId, title, status, created_at AS createdAt
    FROM suggestions
    WHERE public_id LIKE @like OR title LIKE @like OR details LIKE @like OR category LIKE @like
    ORDER BY id DESC
    LIMIT 10
  `).all({ like }) as unknown as ReportSearchResult[];

  const spark = database.prepare(`
    SELECT 'spark' AS type, public_id AS publicId, activity AS title, status, created_at AS createdAt
    FROM spark_reports
    WHERE public_id LIKE @like OR session_public_id LIKE @like OR spark_url LIKE @like OR activity LIKE @like OR suspected_area LIKE @like
    ORDER BY id DESC
    LIMIT 10
  `).all({ like }) as unknown as ReportSearchResult[];

  const playtests = database.prepare(`
    SELECT 'playtest' AS type, public_id AS publicId, test_type AS title, status, created_at AS createdAt
    FROM playtest_sessions
    WHERE public_id LIKE @like OR tester_name LIKE @like OR modpack_version LIKE @like OR test_type LIKE @like OR notes LIKE @like
    ORDER BY id DESC
    LIMIT 10
  `).all({ like }) as unknown as ReportSearchResult[];

  const qaForwards = database.prepare(`
    SELECT 'qa' AS type, public_id AS publicId, question AS title, status, created_at AS createdAt
    FROM qa_forwards
    WHERE public_id LIKE @like OR question LIKE @like OR username LIKE @like
    ORDER BY id DESC
    LIMIT 10
  `).all({ like }) as unknown as ReportSearchResult[];

  return [...bugs, ...crashes, ...performance, ...feedback, ...suggestions, ...spark, ...playtests, ...qaForwards]
    .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
    .slice(0, 10);
}

export function bugStatusButtons(publicId: string): ActionRowBuilder<ButtonBuilder> {
  return new ActionRowBuilder<ButtonBuilder>().addComponents(
    new ButtonBuilder()
      .setCustomId(`bugstatus:${publicId}:investigating`)
      .setLabel('Mark investigating')
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`bugstatus:${publicId}:fixed`)
      .setLabel('Mark fixed')
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`bugstatus:${publicId}:duplicate`)
      .setLabel('Mark duplicate')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`bugstatus:${publicId}:needs_more_info`)
      .setLabel('Needs more info')
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId(`bugstatus:${publicId}:wontfix`)
      .setLabel('Mark wontfix')
      .setStyle(ButtonStyle.Danger)
  );
}

export async function handleBugStatusButton(interaction: ButtonInteraction): Promise<boolean> {
  if (!interaction.customId.startsWith('bugstatus:')) {
    return false;
  }

  if (!(await requireStaff(interaction))) {
    return true;
  }

  const parts = interaction.customId.split(':');
  const publicId = parts[1];
  const status = parts[2] as ReportStatus | undefined;
  if (!publicId || !status) {
    await interaction.reply({
      content: 'That bug status button is malformed.',
      ephemeral: true
    });
    return true;
  }

  const updated = updateReportStatus('bug', publicId, status);
  const report = getBugReport(publicId);

  if (!updated || !report) {
    await interaction.reply({
      content: `No bug report found for ${publicId}.`,
      ephemeral: true
    });
    return true;
  }

  await interaction.update({
    embeds: [bugReportEmbed(report)],
    components: [bugStatusButtons(report.publicId), reportClaimButtons('bug', report.publicId)]
  });

  return true;
}

function mapBug(row: BugRow): BugReportRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    userId: row.user_id,
    username: row.username,
    modpackVersion: row.modpack_version,
    minecraftVersion: row.minecraft_version,
    loaderVersion: row.loader_version,
    playMode: row.play_mode,
    happened: row.happened,
    expected: row.expected,
    steps: row.steps,
    location: row.location,
    anomalyContext: row.anomaly_context,
    repeatable: row.repeatable,
    sparkLink: row.spark_link,
    attachmentUrl: row.attachment_url,
    attachmentName: row.attachment_name,
    screenshotUrl: row.screenshot_url,
    screenshotName: row.screenshot_name,
    logFileName: row.log_file_name,
    redactedLog: row.redacted_log,
    claimedBy: row.claimed_by,
    claimedByUsername: row.claimed_by_username,
    claimedAt: row.claimed_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapCrash(row: CrashRow): CrashReportRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    userId: row.user_id,
    username: row.username,
    fileName: row.file_name,
    fileSize: row.file_size,
    redactedLog: row.redacted_log,
    likelyCause: row.likely_cause,
    confidence: row.confidence,
    nextSteps: row.next_steps,
    claimedBy: row.claimed_by,
    claimedByUsername: row.claimed_by_username,
    claimedAt: row.claimed_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapPerformance(row: PerformanceRow): PerformanceReportRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    userId: row.user_id,
    username: row.username,
    modpackVersion: row.modpack_version,
    fpsAverage: row.fps_average,
    ramAllocated: row.ram_allocated,
    cpuGpu: row.cpu_gpu,
    javaVersion: row.java_version,
    launcher: row.launcher,
    shaders: row.shaders,
    renderDistance: row.render_distance,
    lagLocation: row.lag_location,
    activity: row.activity,
    claimedBy: row.claimed_by,
    claimedByUsername: row.claimed_by_username,
    claimedAt: row.claimed_at,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapFeedback(row: FeedbackRow): FeedbackReportRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    userId: row.user_id,
    username: row.username,
    category: row.category,
    modpackVersion: row.modpack_version,
    summary: row.summary,
    details: row.details,
    createdAt: row.created_at
  };
}

function bugReportModal(draftId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`bugreport:${draftId}`)
    .setTitle('Wilderness Oddesy Bug Report')
    .addComponents(
      textInputRow('modpack_version', 'Modpack version', TextInputStyle.Short, true, 'Example: 0.1.0'),
      textInputRow('happened', 'What happened?', TextInputStyle.Paragraph, true, 'Describe the bug clearly.'),
      textInputRow('expected', 'What did you expect?', TextInputStyle.Paragraph, true, 'What should have happened instead?'),
      textInputRow('steps', 'Steps to reproduce', TextInputStyle.Paragraph, true, 'List the steps staff can try.')
    );
}

function performanceReportModal(draftId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`perfreport:${draftId}`)
    .setTitle('Optional Performance Report')
    .addComponents(
      textInputRow('modpack_version', 'Modpack version', TextInputStyle.Short, true, 'Example: 0.1.0'),
      textInputRow('fps_average', 'FPS average', TextInputStyle.Short, true, 'Example: 45 FPS'),
      textInputRow('ram_allocated', 'RAM allocated', TextInputStyle.Short, true, 'Example: 8 GB'),
      textInputRow('lag_location', 'Where does lag happen?', TextInputStyle.Paragraph, true, 'Structures, rifts, anomalies, dimensions, entities, etc.'),
      textInputRow('activity', 'What were you doing?', TextInputStyle.Paragraph, true, 'Exploring, fighting, generating chunks, using shaders, etc.')
    );
}

function feedbackReportModal(draftId: string): ModalBuilder {
  return new ModalBuilder()
    .setCustomId(`feedback:${draftId}`)
    .setTitle('Wilderness Oddesy Feedback')
    .addComponents(
      textInputRow('summary', 'Short summary', TextInputStyle.Short, true, 'Example: Rifts feel too punishing early.'),
      textInputRow('details', 'Details', TextInputStyle.Paragraph, true, 'Tell staff what you noticed and what would help.')
    );
}

function textInputRow(
  customId: string,
  label: string,
  style: TextInputStyle,
  required: boolean,
  placeholder?: string
): ActionRowBuilder<TextInputBuilder> {
  const input = new TextInputBuilder()
    .setCustomId(customId)
    .setLabel(label)
    .setStyle(style)
    .setRequired(required);

  if (placeholder) {
    input.setPlaceholder(placeholder);
  }

  return new ActionRowBuilder<TextInputBuilder>().addComponents(input);
}
