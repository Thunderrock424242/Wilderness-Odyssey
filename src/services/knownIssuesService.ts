import { getDb } from '../db';
import type { BugReportRecord, ChangelogEntryRecord, KnownIssueRecord } from '../types';

interface KnownIssueRow {
  id: number;
  title: string;
  description: string;
  status: string;
  severity: string;
  added_by: string;
  source_report_type: string | null;
  source_report_public_id: string | null;
  created_at: string;
  updated_at: string;
}

interface ChangelogRow {
  id: number;
  version: string;
  title: string;
  details: string;
  added_by: string;
  created_at: string;
}

export function listKnownIssues(limit = 10): KnownIssueRecord[] {
  const rows = getDb().prepare(`
    SELECT * FROM known_issues
    ORDER BY
      CASE status
        WHEN 'confirmed' THEN 0
        WHEN 'open' THEN 0
        WHEN 'investigating' THEN 1
        WHEN 'solved' THEN 2
        WHEN 'monitoring' THEN 3
        ELSE 3
      END,
      id DESC
    LIMIT ?
  `).all(limit) as unknown as KnownIssueRow[];

  return rows.map(mapKnownIssue);
}

export function addKnownIssue(input: {
  title: string;
  description: string;
  status: string;
  severity: string;
  addedBy: string;
}): KnownIssueRecord {
  const database = getDb();
  const info = database.prepare(`
    INSERT INTO known_issues (title, description, status, severity, added_by)
    VALUES (@title, @description, @status, @severity, @addedBy)
  `).run(input);

  const issue = getKnownIssue(Number(info.lastInsertRowid));
  if (!issue) {
    throw new Error('Failed to read created known issue.');
  }

  return issue;
}

export function syncKnownIssueFromBugStatus(input: {
  report: BugReportRecord;
  status: 'confirmed' | 'solved';
  addedBy: string;
}): KnownIssueRecord {
  const database = getDb();
  const existing = database.prepare(`
    SELECT id FROM known_issues
    WHERE source_report_type = 'bug' AND source_report_public_id = ?
  `).get(input.report.publicId) as { id: number } | undefined;

  const values = {
    title: `${input.report.publicId}: ${input.report.happened}`.slice(0, 240),
    description: bugKnownIssueDescription(input.report, input.status),
    status: input.status,
    severity: 'medium',
    addedBy: input.addedBy,
    sourceReportType: 'bug',
    sourceReportPublicId: input.report.publicId
  };

  if (existing) {
    database.prepare(`
      UPDATE known_issues
      SET title = @title,
          description = @description,
          status = @status,
          severity = @severity,
          updated_at = datetime('now')
      WHERE id = @id
    `).run({ ...values, id: existing.id });

    const issue = getKnownIssue(existing.id);
    if (issue) {
      return issue;
    }
  }

  const info = database.prepare(`
    INSERT INTO known_issues (
      title, description, status, severity, added_by, source_report_type, source_report_public_id
    ) VALUES (
      @title, @description, @status, @severity, @addedBy, @sourceReportType, @sourceReportPublicId
    )
  `).run(values);

  const issue = getKnownIssue(Number(info.lastInsertRowid));
  if (!issue) {
    throw new Error('Failed to read synced known issue.');
  }

  return issue;
}

export function updateKnownIssue(id: number, input: {
  title: string;
  description: string;
  status: string;
  severity: string;
}): KnownIssueRecord | null {
  const result = getDb().prepare(`
    UPDATE known_issues
    SET title = @title,
        description = @description,
        status = @status,
        severity = @severity,
        updated_at = datetime('now')
    WHERE id = @id
  `).run({ ...input, id });

  return result.changes > 0 ? getKnownIssue(id) : null;
}

export function removeKnownIssue(id: number): boolean {
  const result = getDb().prepare('DELETE FROM known_issues WHERE id = ?').run(id);
  return result.changes > 0;
}

export function getKnownIssue(id: number): KnownIssueRecord | null {
  const row = getDb().prepare('SELECT * FROM known_issues WHERE id = ?').get(id) as KnownIssueRow | undefined;
  return row ? mapKnownIssue(row) : null;
}

export function listChangelogEntries(limit = 5): ChangelogEntryRecord[] {
  const rows = getDb().prepare(`
    SELECT * FROM changelog_entries
    ORDER BY id DESC
    LIMIT ?
  `).all(limit) as unknown as ChangelogRow[];

  return rows.map(mapChangelog);
}

export function addChangelogEntry(input: {
  version: string;
  title: string;
  details: string;
  addedBy: string;
}): ChangelogEntryRecord {
  const database = getDb();
  const info = database.prepare(`
    INSERT INTO changelog_entries (version, title, details, added_by)
    VALUES (@version, @title, @details, @addedBy)
  `).run(input);

  const row = database.prepare('SELECT * FROM changelog_entries WHERE id = ?').get(Number(info.lastInsertRowid)) as ChangelogRow | undefined;
  if (!row) {
    throw new Error('Failed to read created changelog entry.');
  }

  return mapChangelog(row);
}

function mapKnownIssue(row: KnownIssueRow): KnownIssueRecord {
  return {
    id: row.id,
    title: row.title,
    description: row.description,
    status: row.status,
    severity: row.severity,
    addedBy: row.added_by,
    sourceReportType: row.source_report_type,
    sourceReportPublicId: row.source_report_public_id,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

function bugKnownIssueDescription(report: BugReportRecord, status: 'confirmed' | 'solved'): string {
  const heading = status === 'solved'
    ? 'Solved by devs and queued for an upcoming fix.'
    : 'Confirmed by devs as a legitimate bug.';

  return [
    heading,
    '',
    `Source bug: ${report.publicId}`,
    `Modpack version: ${report.modpackVersion}`,
    report.minecraftVersion ? `Minecraft version: ${report.minecraftVersion}` : null,
    report.loaderVersion ? `Loader version: ${report.loaderVersion}` : null,
    '',
    `What happens: ${report.happened}`,
    `Expected: ${report.expected}`,
    `Steps: ${report.steps}`
  ].filter(Boolean).join('\n');
}

function mapChangelog(row: ChangelogRow): ChangelogEntryRecord {
  return {
    id: row.id,
    version: row.version,
    title: row.title,
    details: row.details,
    addedBy: row.added_by,
    createdAt: row.created_at
  };
}
