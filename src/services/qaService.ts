import { EmbedBuilder, Message } from 'discord.js';
import { config } from '../config';
import { getDb } from '../db';
import type { QaForwardRecord } from '../types';
import { formatPublicId, normalizePublicId } from '../utils/ids';
import { baseEmbed, colors, truncate } from '../utils/embeds';
import { loadDefaultQaAnswers, type QaAnswerCategory } from './qaAnswerCatalog';
import { sendToConfiguredChannel } from './reportService';
import { postStaffLog } from './staffLogService';
import {
  teamAlertAllowedMentions,
  teamAlertContent,
  type AlertTeam
} from '../utils/supportTeam';

interface QaForwardRow {
  id: number;
  public_id: string;
  user_id: string;
  username: string;
  channel_id: string;
  message_id: string;
  message_url: string;
  question: string;
  status: 'forwarded' | 'answered';
  created_at: string;
  updated_at: string;
}

interface KnownAnswer {
  title: string;
  body: string;
  category: QaAnswerCategory;
  source: 'staff' | 'default';
  triggerTerms: string[];
  fields?: Array<{
    name: string;
    value: string;
  }>;
}

type QaRoute = 'question' | 'bug' | 'crash' | 'performance';

interface QaClassification {
  route: QaRoute;
  label: string;
  alertTeams: AlertTeam[];
}

export interface QaAnswerRecord {
  id: number;
  triggerTerms: string;
  title: string;
  answer: string;
  addedBy: string;
  enabled: boolean;
  createdAt: string;
  updatedAt: string;
}

interface QaAnswerRow {
  id: number;
  trigger_terms: string;
  title: string;
  answer: string;
  added_by: string;
  enabled: number;
  created_at: string;
  updated_at: string;
}

export async function handleQuestionMessage(message: Message): Promise<void> {
  if (message.author.bot || !message.guild) {
    return;
  }

  if (isQaForumStarterMessage(message)) {
    await handleQaForumPost(message);
    return;
  }

  if (!config.qa.channelIds.includes(message.channelId)) {
    return;
  }

  const question = message.content.trim();
  const knownAnswer = answerKnownQuestion(question);
  if (!knownAnswer && !shouldHandleQuestion(question)) {
    return;
  }

  if (knownAnswer) {
    await message.reply({
      embeds: [qaAnswerEmbed(knownAnswer)],
      allowedMentions: { repliedUser: false }
    });

    await postStaffLog(message.client, {
      title: 'Q&A Answer Sent',
      description: `A canned answer was sent in <#${message.channelId}>.`,
      fields: [
        { name: 'Answer', value: knownAnswer.title, inline: true },
        { name: 'Source', value: knownAnswer.source, inline: true },
        { name: 'Category', value: knownAnswer.category, inline: true },
        { name: 'Asked by', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
        { name: 'Question', value: question }
      ]
    });
    return;
  }

  const forward = createQaForward({
    userId: message.author.id,
    username: message.author.tag,
    channelId: message.channelId,
    messageId: message.id,
    messageUrl: message.url,
    question
  });

  const posted = await sendToConfiguredChannel(message.client, config.qa.alertChannelId, {
    content: teamAlertContent(`New Q&A handoff: ${forward.publicId}`, ['qa']),
    embeds: [qaForwardEmbed(forward)],
    allowedMentions: teamAlertAllowedMentions(['qa'])
  });

  await postStaffLog(message.client, {
    title: 'Q&A Handoff Created',
    description: `${forward.publicId} was forwarded to the Q&A team.`,
    fields: [
      { name: 'Handoff', value: forward.publicId, inline: true },
      { name: 'Asked by', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
      { name: 'Source', value: `<#${message.channelId}>`, inline: true },
      { name: 'Alert posted', value: posted ? 'Yes' : 'No', inline: true },
      { name: 'Question', value: question }
    ]
  });

  await message.reply({
    content: posted
      ? `Thanks for asking. I do not have a confident answer yet, so I forwarded this to the Q&A team as **${forward.publicId}**.`
      : `Thanks for asking. I do not have a confident answer yet. The Q&A team channel is not configured, but I saved this as **${forward.publicId}**.`,
    allowedMentions: { repliedUser: false }
  });
}

export async function maybeReplyWithKnownAnswer(
  message: Message,
  options: {
    requireQuestion?: boolean;
    supportStatus?: string;
  } = {}
): Promise<boolean> {
  const content = message.content.trim();
  if (options.requireQuestion && !looksLikeSupportQuestion(content)) {
    return false;
  }

  const knownAnswer = answerKnownQuestion(content);
  if (!knownAnswer) {
    return false;
  }

  await message.reply({
    embeds: [qaAnswerEmbed(knownAnswer, { supportStatus: options.supportStatus })],
    allowedMentions: { repliedUser: false }
  });
  return true;
}

async function handleQaForumPost(message: Message): Promise<void> {
  const question = forumQuestionText(message);
  const knownAnswer = answerKnownQuestion(question);
  const classification = classifyQaForumPost(message, question);
  const forward = createQaForward({
    userId: message.author.id,
    username: message.author.tag,
    channelId: message.channelId,
    messageId: message.id,
    messageUrl: message.url,
    question
  });

  if (knownAnswer) {
    markQaForwardAnswered(forward.publicId);
  }

  const posted = await sendToConfiguredChannel(message.client, config.qa.alertChannelId, {
    content: teamAlertContent(`New ${classification.label} forum post: ${forward.publicId}`, classification.alertTeams),
    embeds: [qaForumAlertEmbed(message, forward, classification, knownAnswer)],
    allowedMentions: teamAlertAllowedMentions(classification.alertTeams)
  });

  await postStaffLog(message.client, {
    title: 'Forum Post Routed',
    description: `${forward.publicId} was routed as ${classification.label}.`,
    fields: [
      { name: 'Handoff', value: forward.publicId, inline: true },
      { name: 'Route', value: classification.route, inline: true },
      { name: 'Asked by', value: `<@${message.author.id}> (${message.author.tag})`, inline: true },
      { name: 'Alert posted', value: posted ? 'Yes' : 'No', inline: true },
      { name: 'Bot answer', value: knownAnswer ? knownAnswer.title : 'No canned answer matched.', inline: true },
      { name: 'Question', value: question }
    ]
  });

  if (knownAnswer) {
    await message.reply({
      embeds: [qaAnswerEmbed(knownAnswer, {
        supportStatus: posted
          ? 'I also alerted support so they can keep an eye on this post.'
          : 'I saved this for support review, but the Q&A alert channel is not configured yet.'
      })],
      allowedMentions: { repliedUser: false }
    });
    return;
  }

  await message.reply({
    content: posted
      ? `Thanks, I alerted support for this forum post as **${forward.publicId}**. Staff can follow up here.`
      : `Thanks, I saved this forum post as **${forward.publicId}**. The Q&A alert channel is not configured yet, so staff alerts are not being sent.`,
    allowedMentions: { repliedUser: false }
  });
}

function createQaForward(input: {
  userId: string;
  username: string;
  channelId: string;
  messageId: string;
  messageUrl: string;
  question: string;
}): QaForwardRecord {
  const database = getDb();
  const info = database.prepare(`
    INSERT INTO qa_forwards (
      user_id, username, channel_id, message_id, message_url, question
    ) VALUES (
      @userId, @username, @channelId, @messageId, @messageUrl, @question
    )
  `).run(input);

  const id = Number(info.lastInsertRowid);
  const publicId = formatPublicId('qa', id);
  database.prepare('UPDATE qa_forwards SET public_id = @publicId WHERE id = @id').run({ publicId, id });

  const row = database.prepare('SELECT * FROM qa_forwards WHERE id = ?').get(id) as QaForwardRow | undefined;
  if (!row) {
    throw new Error(`Failed to read created Q&A forward ${publicId}`);
  }

  return mapForward(row);
}

function markQaForwardAnswered(publicId: string): void {
  getDb().prepare(`
    UPDATE qa_forwards
    SET status = 'answered',
        updated_at = datetime('now')
    WHERE public_id = ?
  `).run(normalizePublicId(publicId));
}

export function getQaForward(publicId: string): QaForwardRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM qa_forwards WHERE public_id = ?')
    .get(normalizePublicId(publicId)) as QaForwardRow | undefined;

  return row ? mapForward(row) : null;
}

function isQaForumStarterMessage(message: Message): boolean {
  if (!config.qa.forumChannelId || !message.channel.isThread()) {
    return false;
  }

  return message.channel.parentId === config.qa.forumChannelId && message.id === message.channel.id;
}

function forumQuestionText(message: Message): string {
  const title = message.channel.isThread() ? message.channel.name.trim() : '';
  const body = message.content.trim();

  if (title && body) {
    return `${title}\n\n${body}`;
  }

  return title || body || 'New Q&A forum post';
}

function classifyQaForumPost(message: Message, question: string): QaClassification {
  const normalized = `${question} ${forumTagNames(message).join(' ')}`.toLowerCase();

  if (matchesAny(normalized, [
    ...config.forumTags.crash.map((tag) => tag.toLowerCase()),
    'crash',
    'crashed',
    'crashing',
    'latest.log',
    'crash report',
    'exception',
    'error log'
  ])) {
    return {
      route: 'crash',
      label: 'crash Q&A',
      alertTeams: ['qa', 'dev']
    };
  }

  if (matchesAny(normalized, [
    ...config.forumTags.bug.map((tag) => tag.toLowerCase()),
    'bug',
    'glitch',
    'broken',
    'not working',
    'does not work'
  ])) {
    return {
      route: 'bug',
      label: 'bug Q&A',
      alertTeams: ['qa', 'dev']
    };
  }

  if (matchesAny(normalized, [
    ...config.forumTags.performance.map((tag) => tag.toLowerCase()),
    'lag',
    'fps',
    'stutter',
    'performance',
    'freezing',
    'freeze'
  ])) {
    return {
      route: 'performance',
      label: 'performance Q&A',
      alertTeams: ['qa']
    };
  }

  return {
    route: 'question',
    label: 'community Q&A',
    alertTeams: ['qa']
  };
}

function forumTagNames(message: Message): string[] {
  if (!message.channel.isThread()) {
    return [];
  }

  const thread = message.channel;
  const parent = thread.parent;
  if (!parent || !('availableTags' in parent) || !('appliedTags' in thread)) {
    return [];
  }

  const tags = parent.availableTags as Array<{ id: string; name: string }>;
  const appliedTags = thread.appliedTags as string[];
  return appliedTags.map((tagId) => tags.find((tag) => tag.id === tagId)?.name ?? tagId);
}

function answerKnownQuestion(question: string): KnownAnswer | null {
  const normalized = question.toLowerCase();
  const configuredAnswer = findConfiguredAnswer(normalized);
  if (configuredAnswer) {
    return configuredAnswer;
  }

  const answer = loadDefaultQaAnswers().find((item) => matchesAny(normalized, item.triggerTerms));
  return answer
    ? {
      title: answer.title,
      body: answer.body,
      category: answer.category,
      source: 'default',
      triggerTerms: answer.triggerTerms
    }
    : null;
}

export function addQaAnswer(input: {
  triggerTerms: string;
  title: string;
  answer: string;
  addedBy: string;
}): QaAnswerRecord {
  const info = getDb().prepare(`
    INSERT INTO qa_answers (
      trigger_terms, title, answer, added_by
    ) VALUES (
      @triggerTerms, @title, @answer, @addedBy
    )
  `).run(input);

  const row = getDb().prepare('SELECT * FROM qa_answers WHERE id = ?').get(Number(info.lastInsertRowid)) as QaAnswerRow | undefined;
  if (!row) {
    throw new Error('Failed to read created Q&A answer.');
  }

  return mapQaAnswer(row);
}

export function getQaAnswer(id: number): QaAnswerRecord | null {
  const row = getDb().prepare('SELECT * FROM qa_answers WHERE id = ?').get(id) as QaAnswerRow | undefined;
  return row ? mapQaAnswer(row) : null;
}

export function updateQaAnswer(
  id: number,
  input: {
    triggerTerms: string;
    title: string;
    answer: string;
  }
): QaAnswerRecord | null {
  const result = getDb().prepare(`
    UPDATE qa_answers
    SET trigger_terms = @triggerTerms,
        title = @title,
        answer = @answer,
        updated_at = datetime('now')
    WHERE id = @id
  `).run({ id, ...input });

  return result.changes > 0 ? getQaAnswer(id) : null;
}

export function listQaAnswers(limit = 10): QaAnswerRecord[] {
  const rows = getDb().prepare(`
    SELECT * FROM qa_answers
    ORDER BY id DESC
    LIMIT ?
  `).all(limit) as unknown as QaAnswerRow[];

  return rows.map(mapQaAnswer);
}

export function removeQaAnswer(id: number): boolean {
  const result = getDb().prepare(`
    UPDATE qa_answers
    SET enabled = 0,
        updated_at = datetime('now')
    WHERE id = ?
  `).run(id);

  return result.changes > 0;
}

function findConfiguredAnswer(question: string): KnownAnswer | null {
  const rows = getDb().prepare(`
    SELECT * FROM qa_answers
    WHERE enabled = 1
    ORDER BY id DESC
  `).all() as unknown as QaAnswerRow[];

  for (const row of rows) {
    const terms = row.trigger_terms
      .split(',')
      .map((term) => term.trim().toLowerCase())
      .filter(Boolean);

    if (matchesAny(question, terms)) {
      return {
        title: row.title,
        body: row.answer,
        category: 'general',
        source: 'staff',
        triggerTerms: terms
      };
    }
  }

  return null;
}

function shouldHandleQuestion(content: string): boolean {
  if (content.length < 8) {
    return false;
  }

  const normalized = content.toLowerCase();
  return looksLikeSupportQuestion(content)
    || matchesAny(normalized, [
      'crash',
      'bug',
      'lag',
      'spark',
      'java',
      'ram',
      'curseforge',
      'playtest',
      'install',
      'not working'
    ]);
}

function looksLikeSupportQuestion(content: string): boolean {
  const normalized = content.trim().toLowerCase();
  return normalized.includes('?')
    || /^(how|what|why|where|when|which|can|could|do|does|is|are|should|help)\b/.test(normalized)
    || normalized.startsWith('i need help')
    || normalized.startsWith('need help');
}

function matchesAny(value: string, needles: string[]): boolean {
  const normalizedValue = value.toLowerCase();
  return needles.some((needle) => matchesTerm(normalizedValue, needle.toLowerCase()));
}

function matchesTerm(value: string, needle: string): boolean {
  const term = needle.trim();
  if (!term) {
    return false;
  }

  if (/[^a-z0-9]/.test(term)) {
    return value.includes(term);
  }

  const suffix = term.length >= 5 ? '[a-z0-9]*' : '';
  return new RegExp(`(^|[^a-z0-9])${escapeRegExp(term)}${suffix}([^a-z0-9]|$)`).test(value);
}

function escapeRegExp(value: string): string {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function qaAnswerEmbed(answer: KnownAnswer, options: { supportStatus?: string } = {}): EmbedBuilder {
  const embed = baseEmbed(answer.title, truncate(answer.body, 3900))
    .setColor(qaAnswerColor(answer.category));

  if (answer.fields?.length) {
    embed.addFields(...answer.fields.map((field) => ({
      name: truncate(field.name, 256),
      value: truncate(field.value)
    })));
  }

  if (options.supportStatus) {
    embed.addFields({
      name: 'Support visibility',
      value: options.supportStatus
    });
  }

  embed.addFields({
    name: 'Next step',
    value: 'If that does not solve it, reply with what you tried and staff can step in.'
  });

  return embed;
}

function qaAnswerColor(category: QaAnswerCategory): number {
  if (category === 'crash') {
    return colors.danger;
  }

  if (category === 'bug') {
    return colors.warning;
  }

  if (category === 'performance') {
    return colors.calm;
  }

  return colors.primary;
}

export function qaForwardEmbed(forward: QaForwardRecord): EmbedBuilder {
  return new EmbedBuilder()
    .setTitle(`Q&A Handoff ${forward.publicId}`)
    .setColor(colors.staff)
    .setTimestamp()
    .addFields(
      { name: 'Question', value: truncate(forward.question) },
      { name: 'Asked by', value: `<@${forward.userId}>`, inline: true },
      { name: 'Source', value: `[Jump to message](${forward.messageUrl})`, inline: true },
      { name: 'Status', value: forward.status, inline: true }
    );
}

function qaForumAlertEmbed(
  message: Message,
  forward: QaForwardRecord,
  classification: QaClassification,
  knownAnswer: KnownAnswer | null
): EmbedBuilder {
  const title = message.channel.isThread() ? message.channel.name : 'Community Q&A post';
  const tags = forumTagNames(message);

  return new EmbedBuilder()
    .setTitle(`Community Q&A ${forward.publicId}`)
    .setColor(qaRouteColor(classification.route))
    .setTimestamp()
    .addFields(
      { name: 'Forum post', value: truncate(title) },
      { name: 'Question', value: truncate(forward.question) },
      { name: 'Asked by', value: `<@${forward.userId}>`, inline: true },
      { name: 'Route', value: classification.label, inline: true },
      { name: 'Tags', value: tags.length > 0 ? tags.join(', ') : 'None', inline: true },
      { name: 'Source', value: `[Open forum post](${forward.messageUrl})`, inline: true },
      { name: 'Bot answer', value: knownAnswer ? knownAnswer.title : 'No canned answer matched.', inline: true },
      { name: 'Status', value: knownAnswer ? 'answered by bot' : forward.status, inline: true }
    );
}

function qaRouteColor(route: QaRoute): number {
  if (route === 'bug' || route === 'crash') {
    return colors.danger;
  }

  if (route === 'performance') {
    return colors.warning;
  }

  return colors.staff;
}

function mapForward(row: QaForwardRow): QaForwardRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    userId: row.user_id,
    username: row.username,
    channelId: row.channel_id,
    messageId: row.message_id,
    messageUrl: row.message_url,
    question: row.question,
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function mapQaAnswer(row: QaAnswerRow): QaAnswerRecord {
  return {
    id: row.id,
    triggerTerms: row.trigger_terms,
    title: row.title,
    answer: row.answer,
    addedBy: row.added_by,
    enabled: row.enabled === 1,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}
