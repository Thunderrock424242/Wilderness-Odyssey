import { getDb } from '../db';
import type { ChangelogEntryRecord, KnownIssueRecord } from '../types';

interface KnownIssueRow {
  id: number;
  title: string;
  description: string;
  status: string;
  severity: string;
  added_by: string;
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
        WHEN 'open' THEN 0
        WHEN 'investigating' THEN 1
        WHEN 'monitoring' THEN 2
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
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
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
