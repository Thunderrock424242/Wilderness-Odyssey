import { EmbedBuilder } from 'discord.js';
import { getDb } from '../db';
import { baseEmbed, colors, truncate } from '../utils/embeds';

interface CountRow {
  total: number;
}

interface QueueRow {
  type: string;
  publicId: string;
  title: string;
  status: string;
  createdAt: string;
}

interface SuggestionRow {
  publicId: string;
  title: string;
  status: string;
  up: number;
  down: number;
  discussion: number;
}

export function triageDigestEmbed(): EmbedBuilder {
  const db = getDb();
  const embed = baseEmbed('Staff Triage Digest', 'Current support workload and community signals.')
    .setColor(colors.staff);

  embed.addFields(
    { name: 'Open queue', value: openQueueSummary(), inline: false },
    { name: 'Oldest unclaimed', value: oldestUnclaimedSummary(), inline: false },
    { name: 'Top suggestions', value: topSuggestionsSummary(), inline: false },
    { name: 'Playtesting', value: playtestSummary(), inline: false }
  );

  const knownIssueCount = (db.prepare(`
    SELECT COUNT(*) AS total
    FROM known_issues
    WHERE status NOT IN ('fixed', 'wontfix', 'rejected')
  `).get() as CountRow | undefined)?.total ?? 0;

  embed.addFields({
    name: 'Known issues',
    value: `${knownIssueCount} active known issue${knownIssueCount === 1 ? '' : 's'} tracked.`
  });

  return embed;
}

function openQueueSummary(): string {
  const counts = [
    ['Bugs', countOpen('bug_reports')],
    ['Crashes', countOpen('crash_reports')],
    ['Performance', countOpen('performance_reports')],
    ['Spark', countOpen('spark_reports')],
    ['Q&A handoffs', countOpenQa()]
  ];

  return counts.map(([label, count]) => `${label}: ${count}`).join(' | ');
}

function oldestUnclaimedSummary(): string {
  const rows = getDb().prepare(`
    SELECT 'bug' AS type, public_id AS publicId, happened AS title, status, created_at AS createdAt
    FROM bug_reports
    WHERE status IN ('open', 'investigating', 'needs_more_info') AND claimed_by IS NULL
    UNION ALL
    SELECT 'crash' AS type, public_id AS publicId, likely_cause AS title, status, created_at AS createdAt
    FROM crash_reports
    WHERE status IN ('open', 'investigating', 'needs_more_info') AND claimed_by IS NULL
    UNION ALL
    SELECT 'performance' AS type, public_id AS publicId, lag_location AS title, status, created_at AS createdAt
    FROM performance_reports
    WHERE status IN ('open', 'investigating', 'needs_more_info') AND claimed_by IS NULL
    UNION ALL
    SELECT 'spark' AS type, public_id AS publicId, activity AS title, status, created_at AS createdAt
    FROM spark_reports
    WHERE status IN ('new', 'needs_review') AND claimed_by IS NULL
    ORDER BY createdAt ASC
    LIMIT 5
  `).all() as unknown as QueueRow[];

  if (rows.length === 0) {
    return 'No unclaimed open reports right now.';
  }

  return rows
    .map((row) => `${row.publicId} (${row.type}, ${row.status}) - ${truncate(row.title, 140)} | ${row.createdAt}`)
    .join('\n')
    .slice(0, 1024);
}

function topSuggestionsSummary(): string {
  const rows = getDb().prepare(`
    SELECT
      s.public_id AS publicId,
      s.title,
      s.status,
      SUM(CASE WHEN v.vote = 'up' THEN 1 ELSE 0 END) AS up,
      SUM(CASE WHEN v.vote = 'down' THEN 1 ELSE 0 END) AS down,
      SUM(CASE WHEN v.vote = 'discussion' THEN 1 ELSE 0 END) AS discussion
    FROM suggestions s
    LEFT JOIN suggestion_votes v ON v.suggestion_public_id = s.public_id
    GROUP BY s.public_id
    ORDER BY up DESC, discussion DESC, s.id DESC
    LIMIT 5
  `).all() as unknown as SuggestionRow[];

  if (rows.length === 0) {
    return 'No suggestions have votes yet.';
  }

  return rows
    .map((row) => `${row.publicId} (${row.status}) - Up ${row.up ?? 0}, Down ${row.down ?? 0}, Discuss ${row.discussion ?? 0}: ${truncate(row.title, 120)}`)
    .join('\n')
    .slice(0, 1024);
}

function playtestSummary(): string {
  const activeSessions = (getDb().prepare(`
    SELECT COUNT(*) AS total FROM playtest_sessions WHERE status = 'active'
  `).get() as CountRow | undefined)?.total ?? 0;
  const activeReleases = (getDb().prepare(`
    SELECT COUNT(*) AS total FROM playtest_releases WHERE status = 'active'
  `).get() as CountRow | undefined)?.total ?? 0;
  const recentAcceptances = (getDb().prepare(`
    SELECT COUNT(*) AS total
    FROM playtest_release_acceptances
    WHERE accepted_at >= datetime('now', '-7 days')
  `).get() as CountRow | undefined)?.total ?? 0;

  return [
    `Active sessions: ${activeSessions}`,
    `Active releases: ${activeReleases}`,
    `Acceptances in the last 7 days: ${recentAcceptances}`
  ].join(' | ');
}

function countOpen(table: string): number {
  const statusFilter = table === 'spark_reports'
    ? "status IN ('new', 'needs_review')"
    : "status IN ('open', 'investigating', 'needs_more_info')";
  const row = getDb().prepare(`
    SELECT COUNT(*) AS total
    FROM ${table}
    WHERE ${statusFilter}
  `).get() as CountRow | undefined;

  return row?.total ?? 0;
}

function countOpenQa(): number {
  const row = getDb().prepare(`
    SELECT COUNT(*) AS total
    FROM qa_forwards
    WHERE status = 'forwarded'
  `).get() as CountRow | undefined;

  return row?.total ?? 0;
}
