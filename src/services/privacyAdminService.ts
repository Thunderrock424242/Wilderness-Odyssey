import { createHash } from 'node:crypto';
import type { EmbedBuilder } from 'discord.js';
import { getDb } from '../db';
import { baseEmbed, colors } from '../utils/embeds';

interface CountRow {
  total: number;
}

export interface PrivacyActionResult {
  userId: string;
  anonymizedUserId: string;
  changedRows: number;
}

const userTables = [
  ['bug_reports', 'user_id', 'username'],
  ['crash_reports', 'user_id', 'username'],
  ['performance_reports', 'user_id', 'username'],
  ['feedback_reports', 'user_id', 'username'],
  ['suggestions', 'user_id', 'username'],
  ['playtest_sessions', 'user_id', 'username'],
  ['playtest_release_acceptances', 'user_id', 'username'],
  ['qa_forwards', 'user_id', 'username'],
  ['spark_reports', 'user_id', 'username'],
  ['report_updates', 'user_id', 'username']
] as const;

export function privacySummaryEmbed(userId: string): EmbedBuilder {
  const rows = userTables.map(([table, userColumn]) => ({
    table,
    total: countRows(table, userColumn, userId)
  }));
  const minecraftLinks = countRows('minecraft_links', 'user_id', userId);
  const linkCodes = countRows('minecraft_link_codes', 'user_id', userId);
  const votes = countRows('suggestion_votes', 'user_id', userId);

  return baseEmbed('User Data Summary', `Stored bot records for <@${userId}>.`)
    .setColor(colors.staff)
    .addFields(
      {
        name: 'Report and playtest records',
        value: rows
          .filter((row) => row.total > 0)
          .map((row) => `${row.table}: ${row.total}`)
          .join('\n') || 'No report/playtest rows found.'
      },
      {
        name: 'Minecraft verification',
        value: `Active links: ${minecraftLinks} | Link codes: ${linkCodes}`,
        inline: true
      },
      {
        name: 'Suggestion votes',
        value: String(votes),
        inline: true
      }
    );
}

export function anonymizeUserData(userId: string): PrivacyActionResult {
  const anonymizedUserId = anonymizedId(userId);
  const database = getDb();
  let changedRows = 0;

  database.exec('BEGIN');
  try {
    for (const [table, userColumn, usernameColumn] of userTables) {
      changedRows += Number(database.prepare(`
        UPDATE ${table}
        SET ${userColumn} = @anonymizedUserId,
            ${usernameColumn} = 'Anonymized user'
        WHERE ${userColumn} = @userId
      `).run({ userId, anonymizedUserId }).changes);
    }

    changedRows += Number(database.prepare(`
      DELETE FROM suggestion_votes
      WHERE user_id = ?
    `).run(userId).changes);

    changedRows += Number(database.prepare(`
      DELETE FROM minecraft_link_codes
      WHERE user_id = ?
    `).run(userId).changes);

    changedRows += Number(database.prepare(`
      DELETE FROM minecraft_links
      WHERE user_id = ?
    `).run(userId).changes);

    database.exec('COMMIT');
  } catch (error) {
    database.exec('ROLLBACK');
    throw error;
  }

  return { userId, anonymizedUserId, changedRows };
}

export function unlinkMinecraftForUser(userId: string): number {
  const database = getDb();
  const links = Number(database.prepare('DELETE FROM minecraft_links WHERE user_id = ?').run(userId).changes);
  const codes = Number(database.prepare('DELETE FROM minecraft_link_codes WHERE user_id = ?').run(userId).changes);
  return links + codes;
}

function countRows(table: string, userColumn: string, userId: string): number {
  const row = getDb().prepare(`
    SELECT COUNT(*) AS total
    FROM ${table}
    WHERE ${userColumn} = ?
  `).get(userId) as CountRow | undefined;

  return row?.total ?? 0;
}

function anonymizedId(userId: string): string {
  return `anon-${createHash('sha256').update(userId).digest('hex').slice(0, 16)}`;
}
