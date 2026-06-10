import { getDb } from '../db';
import type { LinkedReportRecord, PlaytestSessionRecord } from '../types/playtest';
import { formatPublicId, normalizePublicId } from '../utils/ids';

interface PlaytestSessionRow {
  id: number;
  public_id: string;
  user_id: string;
  username: string;
  tester_name: string;
  modpack_version: string;
  test_type: string;
  expected_duration: string;
  notes: string | null;
  status: 'active' | 'completed';
  successful: string | null;
  crashes: string | null;
  major_lag: string | null;
  bugs_found: string | null;
  spark_reports_attached: string | null;
  rating: number | null;
  final_notes: string | null;
  created_at: string;
  ended_at: string | null;
  updated_at: string;
}

interface LinkedReportRow {
  id: number;
  session_public_id: string;
  report_type: string;
  report_public_id: string;
  created_at: string;
}

export function createPlaytestSession(input: {
  userId: string;
  username: string;
  testerName: string;
  modpackVersion: string;
  testType: string;
  expectedDuration: string;
  notes: string | null;
}): PlaytestSessionRecord {
  const database = getDb();
  const info = database.prepare(`
    INSERT INTO playtest_sessions (
      user_id, username, tester_name, modpack_version, test_type, expected_duration, notes
    ) VALUES (
      @userId, @username, @testerName, @modpackVersion, @testType, @expectedDuration, @notes
    )
  `).run(input);

  const id = Number(info.lastInsertRowid);
  const publicId = formatPublicId('playtest', id);
  database.prepare('UPDATE playtest_sessions SET public_id = @publicId WHERE id = @id').run({ publicId, id });

  const session = getPlaytestSession(publicId);
  if (!session) {
    throw new Error(`Failed to read created playtest session ${publicId}`);
  }

  return session;
}

export function createPlaytestSessionFromBridge(input: {
  userId: string;
  username: string;
  testerName: string;
  modpackVersion: string;
  testType: string;
  expectedDuration: string;
  notes?: string | null;
}): PlaytestSessionRecord {
  return createPlaytestSession({
    ...input,
    notes: input.notes ?? null
  });
}

export function endPlaytestSession(publicId: string, input: {
  successful: string;
  crashes: string;
  majorLag: string;
  bugsFound: string;
  sparkReportsAttached: string;
  rating: number;
  finalNotes: string | null;
}): PlaytestSessionRecord | null {
  const normalized = normalizePublicId(publicId);
  const result = getDb().prepare(`
    UPDATE playtest_sessions
    SET status = 'completed',
        successful = @successful,
        crashes = @crashes,
        major_lag = @majorLag,
        bugs_found = @bugsFound,
        spark_reports_attached = @sparkReportsAttached,
        rating = @rating,
        final_notes = @finalNotes,
        ended_at = datetime('now'),
        updated_at = datetime('now')
    WHERE public_id = @publicId
  `).run({ ...input, publicId: normalized });

  return result.changes > 0 ? getPlaytestSession(normalized) : null;
}

export function getPlaytestSession(publicId: string): PlaytestSessionRecord | null {
  const row = getDb()
    .prepare('SELECT * FROM playtest_sessions WHERE public_id = ?')
    .get(normalizePublicId(publicId)) as PlaytestSessionRow | undefined;

  return row ? mapSession(row) : null;
}

export function listRecentPlaytestSessions(limit = 10): PlaytestSessionRecord[] {
  const rows = getDb().prepare(`
    SELECT * FROM playtest_sessions
    ORDER BY id DESC
    LIMIT ?
  `).all(limit) as unknown as PlaytestSessionRow[];

  return rows.map(mapSession);
}

export function linkReportToSession(sessionPublicId: string, reportType: string, reportPublicId: string): boolean {
  const session = getPlaytestSession(sessionPublicId);
  if (!session) {
    return false;
  }

  const result = getDb().prepare(`
    INSERT OR IGNORE INTO report_links (session_public_id, report_type, report_public_id)
    VALUES (@sessionPublicId, @reportType, @reportPublicId)
  `).run({
    sessionPublicId: session.publicId,
    reportType,
    reportPublicId: normalizePublicId(reportPublicId)
  });

  return result.changes > 0;
}

export function listLinkedReports(sessionPublicId: string): LinkedReportRecord[] {
  const rows = getDb().prepare(`
    SELECT * FROM report_links
    WHERE session_public_id = ?
    ORDER BY id DESC
  `).all(normalizePublicId(sessionPublicId)) as unknown as LinkedReportRow[];

  return rows.map((row) => ({
    id: row.id,
    sessionPublicId: row.session_public_id,
    reportType: row.report_type,
    reportPublicId: row.report_public_id,
    createdAt: row.created_at
  }));
}

function mapSession(row: PlaytestSessionRow): PlaytestSessionRecord {
  return {
    id: row.id,
    publicId: row.public_id,
    userId: row.user_id,
    username: row.username,
    testerName: row.tester_name,
    modpackVersion: row.modpack_version,
    testType: row.test_type,
    expectedDuration: row.expected_duration,
    notes: row.notes,
    status: row.status,
    successful: row.successful,
    crashes: row.crashes,
    majorLag: row.major_lag,
    bugsFound: row.bugs_found,
    sparkReportsAttached: row.spark_reports_attached,
    rating: row.rating,
    finalNotes: row.final_notes,
    createdAt: row.created_at,
    endedAt: row.ended_at,
    updatedAt: row.updated_at
  };
}
