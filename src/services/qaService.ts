import { EmbedBuilder, Message } from 'discord.js';
import { config } from '../config';
import { getDb } from '../db';
import type { QaForwardRecord } from '../types';
import { formatPublicId, normalizePublicId } from '../utils/ids';
import { colors, truncate } from '../utils/embeds';
import { sendToConfiguredChannel } from './reportService';

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
  if (message.author.bot || !message.guild || !config.qa.channelIds.includes(message.channelId)) {
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

  const posted = await sendToConfiguredChannel(message.client, config.qa.teamChannelId, {
    content: config.qa.teamRoleId ? `<@&${config.qa.teamRoleId}> New Q&A handoff: ${forward.publicId}` : `New Q&A handoff: ${forward.publicId}`,
    embeds: [qaForwardEmbed(forward)],
    allowedMentions: config.qa.teamRoleId ? { roles: [config.qa.teamRoleId] } : { parse: [] }
  });

  await message.reply({
    content: posted
      ? `I do not have a confident answer for that yet, so I forwarded it to the Q&A team as **${forward.publicId}**.`
      : `I do not have a confident answer for that yet. The Q&A team channel is not configured, but I saved this as **${forward.publicId}**.`,
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

export function getQaForward(publicId: string): QaForwardRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM qa_forwards WHERE public_id = ?')
    .get(normalizePublicId(publicId)) as QaForwardRow | undefined;

  return row ? mapForward(row) : null;
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
      body: 'Use the Support Hub button **Crash** for a private upload channel, or use `/crash file:<crash-report-or-latest.log>` if you prefer slash commands.'
    };
  }

  if (matchesAny(normalized, ['bug', 'glitch', 'broken', 'not working', 'does not work'])) {
    return {
      title: 'Bug Reports',
      body: 'Use `/bugreport` for reproducible gameplay or content issues. Include what happened, what you expected, and steps staff can try.'
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
