import { getDb } from '../db';
import type { BugReportRecord, ChangelogEntryRecord, KnownIssueRecord } from '../types';

interface KnownIssueRow {
  id: number;
  title: string;
  description: string;
  status: string;
  severity: string;
  affected_versions: string | null;
  fixed_in_version: string | null;
  external_key: string | null;
  external_url: string | null;
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

export function listKnownIssues(limit = 10, version?: string | null): KnownIssueRecord[] {
  const normalizedVersion = version?.trim() || null;
  const versionFilter = normalizedVersion ? `%${normalizedVersion}%` : null;
  const rows = getDb().prepare(`
    SELECT * FROM known_issues
    WHERE @versionFilter IS NULL
      OR affected_versions IS NULL
      OR affected_versions = ''
      OR affected_versions LIKE @versionFilter
      OR fixed_in_version LIKE @versionFilter
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
    LIMIT @limit
  `).all({ versionFilter, limit }) as unknown as KnownIssueRow[];

  return rows.map(mapKnownIssue);
}

export function addKnownIssue(input: {
  title: string;
  description: string;
  status: string;
  severity: string;
  affectedVersions?: string | null;
  fixedInVersion?: string | null;
  externalKey?: string | null;
  externalUrl?: string | null;
  addedBy: string;
}): KnownIssueRecord {
  const database = getDb();
  const info = database.prepare(`
    INSERT INTO known_issues (
      title, description, status, severity, affected_versions, fixed_in_version,
      external_key, external_url, added_by
    ) VALUES (
      @title, @description, @status, @severity, @affectedVersions, @fixedInVersion,
      @externalKey, @externalUrl, @addedBy
    )
  `).run({
    ...input,
    affectedVersions: cleanOptional(input.affectedVersions),
    fixedInVersion: cleanOptional(input.fixedInVersion),
    externalKey: cleanOptional(input.externalKey),
    externalUrl: cleanOptional(input.externalUrl)
  });

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
    affectedVersions: input.report.modpackVersion,
    fixedInVersion: input.status === 'solved' ? 'upcoming' : null,
    externalKey: null,
    externalUrl: null,
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
          affected_versions = @affectedVersions,
          fixed_in_version = @fixedInVersion,
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
      title, description, status, severity, affected_versions, fixed_in_version,
      external_key, external_url, added_by, source_report_type, source_report_public_id
    ) VALUES (
      @title, @description, @status, @severity, @affectedVersions, @fixedInVersion,
      @externalKey, @externalUrl, @addedBy, @sourceReportType, @sourceReportPublicId
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
  affectedVersions?: string | null;
  fixedInVersion?: string | null;
}): KnownIssueRecord | null {
  const result = getDb().prepare(`
    UPDATE known_issues
    SET title = @title,
        description = @description,
        status = @status,
        severity = @severity,
        affected_versions = @affectedVersions,
        fixed_in_version = @fixedInVersion,
        updated_at = datetime('now')
    WHERE id = @id
  `).run({
    ...input,
    id,
    affectedVersions: cleanOptional(input.affectedVersions),
    fixedInVersion: cleanOptional(input.fixedInVersion)
  });

  return result.changes > 0 ? getKnownIssue(id) : null;
}

export function upsertKnownIssueFromExternal(input: {
  externalKey: string;
  externalUrl: string;
  title: string;
  description: string;
  status: string;
  severity: string;
  affectedVersions?: string | null;
  fixedInVersion?: string | null;
  addedBy: string;
}): KnownIssueRecord {
  const database = getDb();
  const existing = database.prepare(`
    SELECT id FROM known_issues
    WHERE external_key = ?
  `).get(input.externalKey) as { id: number } | undefined;

  const values = {
    ...input,
    affectedVersions: cleanOptional(input.affectedVersions),
    fixedInVersion: cleanOptional(input.fixedInVersion)
  };

  if (existing) {
    database.prepare(`
      UPDATE known_issues
      SET title = @title,
          description = @description,
          status = @status,
          severity = @severity,
          affected_versions = @affectedVersions,
          fixed_in_version = @fixedInVersion,
          external_url = @externalUrl,
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
      title, description, status, severity, affected_versions, fixed_in_version,
      external_key, external_url, added_by
    ) VALUES (
      @title, @description, @status, @severity, @affectedVersions, @fixedInVersion,
      @externalKey, @externalUrl, @addedBy
    )
  `).run(values);

  const issue = getKnownIssue(Number(info.lastInsertRowid));
  if (!issue) {
    throw new Error('Failed to read imported known issue.');
  }

  return issue;
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
    affectedVersions: row.affected_versions,
    fixedInVersion: row.fixed_in_version,
    externalKey: row.external_key,
    externalUrl: row.external_url,
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

function cleanOptional(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
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
