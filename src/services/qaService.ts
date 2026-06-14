import { EmbedBuilder, Message } from 'discord.js';
import { config } from '../config';
import { getDb } from '../db';
import type { QaForwardRecord } from '../types';
import { formatPublicId, normalizePublicId } from '../utils/ids';
import { colors, truncate } from '../utils/embeds';
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
  if (!shouldHandleQuestion(question)) {
    return;
  }

  const knownAnswer = answerKnownQuestion(question);
  if (knownAnswer) {
    await message.reply({
      content: [
        `**${knownAnswer.title}**`,
        knownAnswer.body,
        '',
        'If that does not solve it, reply with what you tried and staff can step in.'
      ].join('\n'),
      allowedMentions: { repliedUser: false }
    });

    await postStaffLog(message.client, {
      title: 'Q&A Answer Sent',
      description: `A canned answer was sent in <#${message.channelId}>.`,
      fields: [
        { name: 'Answer', value: knownAnswer.title, inline: true },
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
      content: [
        `**${knownAnswer.title}**`,
        knownAnswer.body,
        '',
        posted
          ? 'I also alerted support so they can keep an eye on this post.'
          : 'I saved this for support review, but the Q&A alert channel is not configured yet.',
        'If that does not solve it, reply with what you tried and staff can step in.'
      ].join('\n'),
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

  if (matchesAny(normalized, ['java', 'unsupportedclassversionerror', 'class file version'])) {
    return {
      title: 'Java Version',
      body: `Use the recommended Java version from \`/status\`. After changing Java in your launcher, relaunch the pack before testing again.`
    };
  }

  if (matchesAny(normalized, ['ram', 'memory', 'outofmemoryerror', 'heap space'])) {
    return {
      title: 'RAM Allocation',
      body: `Check the recommended RAM in \`/status\`. Avoid allocating all system memory; leave room for Windows and the launcher.`
    };
  }

  if (matchesAny(normalized, ['crash', 'crashed', 'crashing', 'latest.log', 'crash report'])) {
    return {
      title: 'Crash Reports',
      body: 'Use the Support Hub button **Crash** for private guided intake. `/crash file:<crash-report-or-latest.log>` can preload the log into the same review flow.'
    };
  }

  if (matchesAny(normalized, ['bug', 'glitch', 'broken', 'not working', 'does not work'])) {
    return {
      title: 'Bug Reports',
      body: 'Use **Bug** in the Support Hub or `/bugreport` for reproducible gameplay or content issues. The bot will ask each field privately, then show a review before posting.'
    };
  }

  if (matchesAny(normalized, ['lag', 'fps', 'stutter', 'performance', 'freezing'])) {
    return {
      title: 'Performance Help',
      body: 'Use `/performance` for reporting guidance or `/perfreport` to archive FPS, RAM, shader, render distance, and lag-location details.'
    };
  }

  if (matchesAny(normalized, ['spark', 'profiler', 'profile link'])) {
    return {
      title: 'Spark Reports',
      body: 'Use `/playtest start`, run Spark during the lag period, then submit the public viewer URL with `/sparkreport`.'
    };
  }

  if (matchesAny(normalized, ['curseforge', 'zip', 'import profile', 'playtest download'])) {
    return {
      title: 'Playtest ZIP Import',
      body: 'For a published playtest, accept the terms/privacy button in the playtest channel. Then download the ZIP, do not unzip it, and import it in CurseForge as an existing ZIP/profile.'
    };
  }

  if (matchesAny(normalized, ['known issue', 'knownissues', 'known bug'])) {
    return {
      title: 'Known Issues',
      body: 'Use `/knownissues` to see the current staff-maintained instability list.'
    };
  }

  return null;
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

    if (terms.some((term) => question.includes(term))) {
      return {
        title: row.title,
        body: row.answer
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
  return normalized.includes('?')
    || /^(how|what|why|where|when|can|could|do|does|is|are|should|help)\b/.test(normalized)
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

function matchesAny(value: string, needles: string[]): boolean {
  return needles.some((needle) => value.includes(needle));
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
